// =============================================================================
// InteriorOS Backend — CRM Leads API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CRMLead } from '@/models/crm-lead.model';
import { User } from '@/models/user.model';
import { successResponse, createdResponse, serverErrorResponse, paginatedResponse, parsePaginationParams, buildPaginationMeta, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';
import { logAuditEvent } from '@/services/audit.service';

const createLeadSchema = z.object({
  leadName: z
    .string()
    .trim()
    .min(2, 'Lead name must be at least 2 characters')
    .max(100)
    .refine((val) => !/\d/.test(val), 'Lead name cannot contain numbers')
    .refine((val) => /^[a-zA-Z\s'.-]+$/.test(val), 'Lead name can only contain letters, spaces, hyphens, and dots'),
  phone: z
    .string()
    .trim()
    .refine((val) => !/[a-zA-Z]/.test(val), 'Phone number cannot contain letters')
    .refine((val) => {
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 10 && digitsOnly.length <= 15;
    }, 'Please enter a valid phone number (10 to 15 digits)'),
  email: z.string().trim().email('Valid email is required'),
  projectType: z.enum(['Commercial Office', 'Residential', 'Tech Office', 'General']).default('General'),
  budget: z.number().nonnegative().default(0),
  location: z.string().optional().default(''),
  propertyType: z.string().optional().default(''),
  source: z.enum(['website', 'meta_ads', 'google_ads', 'justdial', 'indiamart', 'referrals', 'walk_in', 'architects', 'other']).default('other'),
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  assignedDesigner: z.string().optional(),
  assignedSalesPerson: z.string().optional(),
});

// GET: List all leads
async function getLeadsHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    
    const searchParams = req.nextUrl.searchParams;
    const { page, limit, sort, order } = parsePaginationParams(searchParams);
    
    const search = searchParams.get('search') || '';
    const stage = searchParams.get('stage') || '';
    const source = searchParams.get('source') || '';

    const query: any = { organizationId, isDeleted: false };
    
    if (stage) {
      query.stage = stage;
    }
    if (source) {
      query.source = source;
    }
    if (search) {
      query.$or = [
        { leadName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortField = sort === 'createdAt' ? 'createdAt' : sort;
    const sortQuery: any = { [sortField]: sortOrder };

    const total = await CRMLead.countDocuments(query);
    const leads = await CRMLead.find(query)
      .populate('assignedDesigner', 'name email')
      .populate('assignedSalesPerson', 'name email')
      .sort(sortQuery)
      .skip((page - 1) * limit)
      .limit(limit);

    const meta = buildPaginationMeta(total, page, limit);
    return paginatedResponse(leads, meta);
  } catch (error) {
    console.error('List CRM leads error:', error);
    return serverErrorResponse();
  }
}

// POST: Create a new lead
async function createLeadHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    const validation = createLeadSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const leadData = validation.data;

    // Optional: Perform auto qualification heuristics upon creation
    let score = 50; // default base score
    if (leadData.budget > 2000000) score += 20; // 20L+ is high budget
    else if (leadData.budget > 1000000) score += 10;
    
    if (leadData.urgency === 'high') score += 15;
    else if (leadData.urgency === 'medium') score += 5;

    if (leadData.propertyType.toLowerCase().includes('3 bhk') || leadData.propertyType.toLowerCase().includes('villa')) score += 10;

    const lead = new CRMLead({
      ...leadData,
      organizationId,
      leadScore: Math.min(score, 100),
      stage: 'lead',
    });

    await lead.save();

    // Capture audit log
    await logAuditEvent({
      organizationId,
      userId: auth.userId,
      action: 'create',
      entity: 'CRM',
      entityId: lead._id.toString(),
      entityName: lead.leadName,
      description: `Created new CRM lead "${lead.leadName}" with budget ₹${lead.budget.toLocaleString()}`,
      changes: {
        after: {
          leadName: lead.leadName,
          phone: lead.phone,
          email: lead.email,
          projectType: lead.projectType,
          budget: lead.budget,
          source: lead.source,
          stage: lead.stage,
        },
      },
      req,
    });

    return createdResponse(lead, 'CRM Lead created successfully');
  } catch (error: any) {
    console.error('Create CRM lead error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getLeadsHandler);
export const POST = withAuth(createLeadHandler);
