// =============================================================================
// InteriorOS Backend — CRM Customers API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
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
    .min(2, 'Name must be at least 2 characters long')
    .refine((val) => !/\d/.test(val), 'Full name cannot contain numbers')
    .refine((val) => /^[a-zA-Z\s'.-]+$/.test(val), 'Full name can only contain letters, spaces, hyphens, and dots'),
  mobileNumber: z
    .string()
    .trim()
    .refine((val) => !/[a-zA-Z]/.test(val), 'Mobile number cannot contain letters')
    .refine((val) => {
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 10 && digitsOnly.length <= 15;
    }, 'Please enter a valid mobile number (10 to 15 digits)'),
  alternateNumber: z
    .string()
    .trim()
    .refine((val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 10 && digitsOnly.length <= 15;
    }, 'Invalid alternate number')
    .optional()
    .or(z.literal('')),
  email: z.string().trim().email('Please enter a valid email address').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  propertyType: z.enum(['Flat', 'Villa', 'Office', 'Shop', 'Other']).optional(),
  propertyAddress: z.string().optional(),
  projectLocation: z.string().optional(),
  assignedSalesExecutive: z.string().optional(),
  designerAssigned: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High']).optional(),
  budgetRange: z.string().optional(),
  possessionDate: z.coerce.date().optional(),
  siteVisitScheduledDate: z.coerce.date().optional(),
  futureFollowUpDate: z.coerce.date().optional(),
  remarks: z.string().optional(),
});

// GET: List all customers/leads
async function getCustomersHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status');

    const query: any = { organizationId };
    if (status) query.status = status;

    const customers = await CrmCustomer.find(query)
      .populate('assignedSalesExecutive', 'firstName lastName email')
      .populate('designerAssigned', 'firstName lastName email')
      .sort({ createdAt: -1 });

    return successResponse(customers);
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
