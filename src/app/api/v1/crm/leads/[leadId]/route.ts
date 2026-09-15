import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CRMLead } from '@/models/crm-lead.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';
import { logAuditEvent } from '@/services/audit.service';

// GET: Fetch lead details
async function getLeadDetailsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { leadId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return errorResponse('Invalid Lead ID', 400);
    }

    const lead = await CRMLead.findOne({
      _id: leadId,
      organizationId,
      isDeleted: false,
    })
      .populate('assignedDesigner', 'name email')
      .populate('assignedSalesPerson', 'name email');

    if (!lead) {
      return errorResponse('Lead not found', 404);
    }

    return successResponse(lead);
  } catch (error) {
    console.error('Fetch CRM lead details error:', error);
    return serverErrorResponse();
  }
}

import { z } from 'zod';

const updateLeadSchema = z.object({
  leadName: z
    .string()
    .trim()
    .min(2, 'Lead name must be at least 2 characters')
    .refine((val) => !/\d/.test(val), 'Lead name cannot contain numbers')
    .refine((val) => /^[a-zA-Z\s'.-]+$/.test(val), 'Lead name can only contain letters, spaces, hyphens, and dots')
    .optional(),
  phone: z
    .string()
    .trim()
    .refine((val) => {
      if (!val) return true;
      return !/[a-zA-Z]/.test(val);
    }, 'Phone number cannot contain letters')
    .refine((val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 10 && digitsOnly.length <= 15;
    }, 'Please enter a valid phone number (10 to 15 digits)')
    .optional(),
  email: z.string().trim().email('Valid email is required').optional().or(z.literal('')),
  projectType: z.enum(['Commercial Office', 'Residential', 'Tech Office', 'General']).optional(),
  budget: z.number().nonnegative().optional(),
  location: z.string().optional(),
  propertyType: z.string().optional(),
  source: z.enum(['website', 'meta_ads', 'google_ads', 'justdial', 'indiamart', 'referrals', 'walk_in', 'architects', 'other']).optional(),
  stage: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  assignedDesigner: z.string().optional(),
  assignedSalesPerson: z.string().optional(),
  siteVisit: z.any().optional(),
  requirements: z.any().optional(),
});

// PUT: Update lead details
async function updateLeadHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { leadId } = await context.params;
    const body = await req.json();

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return errorResponse('Invalid Lead ID', 400);
    }

    const validation = updateLeadSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const lead = await CRMLead.findOne({
      _id: leadId,
      organizationId,
      isDeleted: false,
    });

    if (!lead) {
      return errorResponse('Lead not found or unauthorized', 404);
    }

    const beforeState = {
      leadName: lead.leadName,
      phone: lead.phone,
      email: lead.email,
      stage: lead.stage,
      budget: lead.budget,
      urgency: lead.urgency,
      location: lead.location,
    };

    // Update fields dynamically
    const fieldsToUpdate = [
      'leadName',
      'phone',
      'email',
      'projectType',
      'budget',
      'location',
      'propertyType',
      'source',
      'stage',
      'urgency',
      'assignedDesigner',
      'assignedSalesPerson',
      'siteVisit',
      'requirements',
    ];

    fieldsToUpdate.forEach((field) => {
      if (body[field] !== undefined) {
        if (field === 'siteVisit' || field === 'requirements') {
          // Merge nested schemas
          lead[field] = { ...lead[field], ...body[field] };
        } else {
          (lead as any)[field] = body[field];
        }
      }
    });

    // Auto-update lead score if key fields changed
    if (body.budget !== undefined || body.urgency !== undefined || body.propertyType !== undefined) {
      let score = 50;
      const budget = body.budget !== undefined ? body.budget : lead.budget;
      const urgency = body.urgency !== undefined ? body.urgency : lead.urgency;
      const propertyType = body.propertyType !== undefined ? body.propertyType : lead.propertyType;

      if (budget > 2000000) score += 20;
      else if (budget > 1000000) score += 10;

      if (urgency === 'high') score += 15;
      else if (urgency === 'medium') score += 5;

      if (propertyType.toLowerCase().includes('3 bhk') || propertyType.toLowerCase().includes('villa')) score += 10;
      lead.leadScore = Math.min(score, 100);
    }

    await lead.save();

    // Capture audit log
    await logAuditEvent({
      organizationId,
      userId: auth.userId,
      action: 'update',
      entity: 'CRM',
      entityId: lead._id.toString(),
      entityName: lead.leadName,
      description: `Updated CRM lead details for "${lead.leadName}" (Stage: ${lead.stage})`,
      changes: {
        before: beforeState,
        after: {
          leadName: lead.leadName,
          phone: lead.phone,
          email: lead.email,
          stage: lead.stage,
          budget: lead.budget,
          urgency: lead.urgency,
          location: lead.location,
        },
      },
      req,
    });

    return successResponse(lead, 'Lead details updated successfully');
  } catch (error: any) {
    console.error('Update CRM lead error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft delete lead
async function deleteLeadHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { leadId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return errorResponse('Invalid Lead ID', 400);
    }

    const lead = await CRMLead.findOneAndUpdate(
      { _id: leadId, organizationId, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!lead) {
      return errorResponse('Lead not found or unauthorized', 404);
    }

    // Capture audit log
    await logAuditEvent({
      organizationId,
      userId: auth.userId,
      action: 'delete',
      entity: 'CRM',
      entityId: lead._id.toString(),
      entityName: lead.leadName,
      description: `Deleted CRM lead "${lead.leadName}"`,
      req,
    });

    return successResponse(null, 'Lead deleted successfully');
  } catch (error) {
    console.error('Delete CRM lead error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getLeadDetailsHandler);
export const PUT = withAuth(updateLeadHandler);
export const DELETE = withAuth(deleteLeadHandler);
