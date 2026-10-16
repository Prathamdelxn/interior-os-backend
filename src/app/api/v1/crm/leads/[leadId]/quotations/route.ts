// =============================================================================
// InteriorOS Backend — CRM Leads Quotations API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withPermission } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CRMLead } from '@/models/crm-lead.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';
import { z } from 'zod';

const createQuotationSchema = z.object({
  boq: z.array(z.object({
    item: z.string().min(1, 'Item name is required'),
    category: z.string().min(1, 'Category is required'),
    quantity: z.number().positive('Quantity must be greater than 0'),
    unit: z.string().default('Rft'),
    rate: z.number().nonnegative('Rate must be non-negative'),
    amount: z.number().nonnegative(),
  })).min(1, 'At least one BOQ item is required'),
  costSheet: z.object({
    materialCost: z.number().nonnegative(),
    laborCost: z.number().nonnegative(),
    margin: z.number().nonnegative().default(15),
    tax: z.number().nonnegative().default(18),
    total: z.number().positive(),
  }),
  proposal: z.object({
    title: z.string().min(1, 'Proposal title is required'),
    description: z.string().optional().default(''),
    terms: z.string().optional().default(''),
    status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'rejected']).default('draft'),
  }),
  pdfUrl: z.string().optional(),
});

// POST: Add a new quotation version
async function createQuotationHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { leadId } = await context.params;
    const body = await req.json();

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return errorResponse('Invalid Lead ID', 400);
    }

    const lead = await CRMLead.findOne({
      _id: leadId,
      organizationId,
      isDeleted: false,
    });

    if (!lead) {
      return errorResponse('Lead not found', 404);
    }

    const validation = createQuotationSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const qData = validation.data;
    const nextVersion = lead.quotations.length + 1;

    const newQuotation = {
      version: nextVersion,
      boq: qData.boq,
      costSheet: qData.costSheet,
      proposal: {
        ...qData.proposal,
        sentAt: qData.proposal.status === 'sent' ? new Date() : undefined,
      },
      pdfUrl: qData.pdfUrl,
      createdAt: new Date(),
    };

    lead.quotations.push(newQuotation);
    
    // Automatically transition lead stage to 'design_proposal' or 'quotation' if it was in previous stages
    if (lead.stage === 'lead' || lead.stage === 'qualified' || lead.stage === 'site_visit') {
      lead.stage = qData.proposal.status === 'draft' ? 'design_proposal' : 'quotation';
    }

    await lead.save();
    return successResponse(newQuotation, 'Quotation version added successfully');
  } catch (error: any) {
    console.error('Create quotation version error:', error);
    return serverErrorResponse();
  }
}

export const POST = withPermission('crm_quotations', 'create', createQuotationHandler);
