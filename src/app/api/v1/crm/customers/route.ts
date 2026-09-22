// =============================================================================
// InteriorOS Backend — CRM Customers API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import {
  successResponse,
  createdResponse,
  serverErrorResponse,
  errorResponse,
  paginatedResponse,
  buildPaginationMeta,
  parsePaginationParams,
} from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const createCustomerSchema = z.object({
  leadSource: z
    .enum([
      'Phone Call',
      'Walk-in',
      'Referral',
      'Existing Customer',
      'Builder Reference',
      'Architect Reference',
      'Society Reference',
      'Social Media',
      'Other',
    ])
    .optional(),
  name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters long')
    .max(50, 'Full name cannot exceed 50 characters')
    .refine((val) => !/\d/.test(val), 'Full name cannot contain numbers')
    .refine((val) => /^[a-zA-Z\s'.-]+$/.test(val), 'Full name can only contain letters, spaces, hyphens, and dots'),
  mobileNumber: z
    .string()
    .trim()
    .refine((val) => !/[a-zA-Z]/.test(val), 'Mobile number cannot contain letters')
    .refine((val) => {
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 10 && digitsOnly.length <= 15;
    }, 'Please enter a valid mobile number (10 to 15 digits)')
    .refine((val) => /^\+?[0-9\s-]{10,18}$/.test(val), 'Invalid phone number format'),
  alternateNumber: z
    .string()
    .trim()
    .refine((val) => {
      if (!val) return true;
      return !/[a-zA-Z]/.test(val);
    }, 'Alternate number cannot contain letters')
    .refine((val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 10 && digitsOnly.length <= 15;
    }, 'Alternate number must be 10 to 15 digits')
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .trim()
    .max(100, 'Email address cannot exceed 100 characters')
    .email('Please enter a valid email address')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(300, 'Address cannot exceed 300 characters').optional(),
  city: z.string().trim().max(100, 'City cannot exceed 100 characters').optional(),
  state: z.string().trim().max(100, 'State cannot exceed 100 characters').optional(),
  pincode: z.string().trim().max(20, 'Pincode cannot exceed 20 characters').optional(),
  propertyType: z.enum(['Flat', 'Villa', 'Office', 'Shop', 'Other']).optional(),
  propertyAddress: z.string().trim().max(300, 'Property address cannot exceed 300 characters').optional(),
  projectLocation: z.string().trim().max(150, 'Project location cannot exceed 150 characters').optional(),
  assignedSalesExecutive: z.string().optional(),
  designerAssigned: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High']).optional(),
  budgetRange: z.string().trim().max(100, 'Budget range cannot exceed 100 characters').optional(),
  possessionDate: z.coerce.date().optional(),
  siteVisitScheduledDate: z.coerce.date().optional(),
  futureFollowUpDate: z.coerce.date().optional(),
  remarks: z.string().trim().max(1000, 'Remarks cannot exceed 1000 characters').optional(),
});

// GET: List all customers/leads with server-side pagination & filtering
async function getCustomersHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    const searchParams = req.nextUrl.searchParams;
    const isAll = searchParams.get('all') === 'true';
    const status = searchParams.get('status');
    const stage = searchParams.get('stage');
    const search = searchParams.get('search')?.trim();
    const { page, limit, sort, order } = parsePaginationParams(searchParams);
    const skip = (page - 1) * limit;

    const query: any = { organizationId };

    // Direct Status filter
    if (status) {
      query.status = status;
    }

    // Pipeline Stage Filter
    if (stage) {
      switch (stage) {
        case 'leads':
          query.status = { $ne: 'Lost' };
          break;
        case 'follow_ups':
          query.status = { $in: ['New Lead', 'Contacted', 'Meeting Scheduled'] };
          break;
        case 'site_visits':
          query.$or = [
            { status: { $in: ['Under Site Visit', 'Measurement Done', 'Meeting Scheduled'] } },
            { 'siteMeasurements.carpetArea': { $exists: true, $ne: '' } },
          ];
          break;
        case 'requirement_design':
          query.$or = [
            { status: { $in: ['Under Requirement', 'Requirement Completed'] } },
            { 'requirements.0': { $exists: true } },
          ];
          break;
        case 'drawing':
          query.$or = [
            { status: { $in: ['Under Drawing', 'Design Approved'] } },
            { 'designFiles.0': { $exists: true } },
          ];
          break;
        case 'boq':
          query.$or = [
            { status: 'Under BOQ Creation' },
            { 'boqs.0': { $exists: true } },
          ];
          break;
        case 'quotations':
          query.$or = [
            {
              status: {
                $in: [
                  'Under Quotation',
                  'Quotation Pending',
                  'Quotation Sent',
                  'Negotiation',
                  'Booking Pending',
                  'Won',
                  'Converted',
                ],
              },
            },
            { 'quotations.0': { $exists: true } },
          ];
          break;
        case 'won_projects':
          query.status = { $in: ['Won', 'Converted'] };
          break;
        case 'lost_leads':
          query.status = 'Lost';
          break;
      }
    }

    // Search filter across key indexed fields
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      const searchConditions: any[] = [
        { name: searchRegex },
        { mobileNumber: searchRegex },
        { leadNumber: searchRegex },
        { email: searchRegex },
        { projectLocation: searchRegex },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortConfig: any = { [sort]: sortOrder };

    if (isAll) {
      const customers = await CrmCustomer.find(query)
        .populate('assignedSalesExecutive', 'firstName lastName email fullName')
        .populate('designerAssigned', 'firstName lastName email fullName')
        .sort(sortConfig)
        .lean();

      return successResponse(customers);
    }

    // High performance parallel execution
    const [total, customers] = await Promise.all([
      CrmCustomer.countDocuments(query),
      CrmCustomer.find(query)
        .populate('assignedSalesExecutive', 'firstName lastName email fullName')
        .populate('designerAssigned', 'firstName lastName email fullName')
        .sort(sortConfig)
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const meta = buildPaginationMeta(total, page, limit);
    return paginatedResponse(customers, meta, 'Customers retrieved successfully');
  } catch (error) {
    console.error('List CRM customers error:', error);
    return serverErrorResponse();
  }
}

// POST: Create a new Lead/Customer
async function createCustomerHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    const validation = createCustomerSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    // Auto-generate Lead Number robustly (handling duplicates)
    let leadNumber = '';
    let retryCount = 0;
    let customer;
    let saved = false;

    while (!saved && retryCount < 5) {
      try {
        // Query existing customers for this org to find the highest numerical leadNumber
        const customersWithLeadNum = await CrmCustomer.find({
          organizationId,
          leadNumber: { $regex: /^LD-\d+$/ },
        })
          .select('leadNumber')
          .lean();

        let maxNum = 1000;
        for (const c of customersWithLeadNum) {
          if (c.leadNumber) {
            const match = c.leadNumber.match(/^LD-(\d+)$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
        }

        let nextNum = maxNum + 1 + retryCount;
        leadNumber = `LD-${nextNum}`;

        const dataToSave = { ...validation.data };
        if (!dataToSave.assignedSalesExecutive) delete dataToSave.assignedSalesExecutive;
        if (!dataToSave.designerAssigned) delete dataToSave.designerAssigned;

        customer = new CrmCustomer({
          ...dataToSave,
          leadNumber,
          organizationId,
          createdBy: auth.userId,
          status: 'New Lead',
        });

        await customer.save();
        saved = true;
      } catch (err: any) {
        if (err.code === 11000 && err.keyPattern && err.keyPattern.leadNumber) {
          // Duplicate lead number, retry with an incremented number
          retryCount++;
          continue;
        }
        throw err;
      }
    }

    if (!saved || !customer) {
      return errorResponse('Failed to generate a unique lead number. Please try again.', 500);
    }

    try {
      const { logAuditEvent } = await import('@/services/audit.service');
      logAuditEvent({
        organizationId,
        userId: auth.userId,
        action: 'create',
        entity: 'CRM',
        entityId: customer._id,
        entityName: customer.name,
        description: `Created new CRM customer lead "${customer.name}" (Lead: ${customer.leadNumber || 'LD'}, Phone: ${customer.mobileNumber})`,
        changes: {
          after: {
            name: customer.name,
            mobileNumber: customer.mobileNumber,
            leadSource: customer.leadSource,
            status: customer.status,
            propertyType: customer.propertyType,
            budgetRange: customer.budgetRange,
          },
        },
        req,
      }).catch(() => {});
    } catch {}

    return createdResponse(customer, 'Customer lead created successfully');
  } catch (error: any) {
    console.error('Create CRM customer error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return errorResponse(messages.join(', '), 400);
    }

    if (error.code === 11000) {
      return errorResponse('Duplicate entry found for unique field', 400);
    }

    return serverErrorResponse();
  }
}

export const GET = withAuth(getCustomersHandler);
export const POST = withAuth(createCustomerHandler);
