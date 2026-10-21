// =============================================================================
// InteriorOS Backend — Project Confirm Order
// The confirmed order (accepted quotation's vendor quotes, dispatches and
// attachments) lives on the CRM lead the project was converted from. These
// routes let project members work on it with the project "Confirm Order"
// permission, without needing CRM access.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

type Ctx = { params: Promise<Record<string, string>> };

// GET: the lead linked to this project (null if the project wasn't converted from a lead)
async function getConfirmOrderHandler(_req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const lead = await CrmCustomer.findOne({ organizationId, linkedProject: projectId }).lean();
    return successResponse(lead ?? null);
  } catch (error) {
    console.error('Get confirm order error:', error);
    return serverErrorResponse();
  }
}

const updateSchema = z.object({
  quotations: z.array(z.any()).optional(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirmedOrder: z.any().optional(),
  // Confirming the order moves the lead to Booking Pending (the only status allowed here)
  status: z.literal('Booking Pending').optional(),
  activityRemarks: z.string().max(1000).optional(),
});

// PATCH: vendor quotes / dispatches inside the quotations, and the order attachments.
// Adding or removing quotations stays a CRM (Quotations) action.
async function updateConfirmOrderHandler(req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const validation = updateSchema.safeParse(await req.json());
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }
    const { quotations, confirmedOrder, status, activityRemarks } = validation.data;

    const lead = await CrmCustomer.findOne({ organizationId, linkedProject: projectId });
    if (!lead) {
      return notFoundResponse('This project has no linked CRM order');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};
    if (quotations !== undefined) {
      if (quotations.length !== (lead.quotations || []).length) {
        return errorResponse('Quotations can only be added or removed from the CRM', 400);
      }
      update.quotations = quotations;
    }
    if (confirmedOrder !== undefined) update.confirmedOrder = confirmedOrder;
    // Never move a won / converted lead backwards
    if (status && !['Won', 'Converted'].includes(lead.status)) update.status = status;
    if (Object.keys(update).length === 0) {
      return errorResponse('Nothing to update', 400);
    }

    const updated = await CrmCustomer.findOneAndUpdate(
      { _id: lead._id, organizationId },
      { $set: update },
      { returnDocument: 'after' }
    ).lean();

    if (status) {
      await CrmActivity.create({
        customer: lead._id,
        user: auth.userId,
        organizationId,
        type: 'Status Change',
        status: 'Completed',
        remarks: activityRemarks || 'Order confirmed from the project',
        completedDate: new Date(),
      });
    }

    return successResponse(updated, 'Confirmed order updated');
  } catch (error) {
    console.error('Update confirm order error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('confirm_order', 'read', getConfirmOrderHandler);
export const PATCH = withProjectPermission('confirm_order', 'update', updateConfirmOrderHandler);
