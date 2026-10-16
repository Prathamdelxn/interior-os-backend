// =============================================================================
// InteriorOS Backend — BOQ Approval Workflow API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { can } from '@/lib/rbac';
import { connectDB } from '@/lib/db';
import { BOQ } from '@/models/boq.model';
import { BOQItem } from '@/models/boq.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse, forbiddenResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const approvalActionSchema = z.object({
  action: z.enum(['submit', 'approve', 'reject']),
  reason: z.string().optional(),
});

// POST: Submit for approval / Approve / Reject a BOQ
async function approvalHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, boqId } = await context.params;
    const body = await req.json();

    const validation = approvalActionSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { action, reason } = validation.data;

    // Sending for approval is editing the BOQ (Update); approving / rejecting is the decision (Approve)
    const { projectId: permProjectId } = await context.params;
    const needed = action === 'submit' ? 'update' : 'approve';
    if (!(await can(auth, 'boq', needed, permProjectId))) {
      return forbiddenResponse(
        action === 'submit'
          ? "You don't have permission to send BOQs for approval"
          : "You don't have permission to approve or reject BOQs"
      );
    }

    const boq = await BOQ.findOne({ _id: boqId, projectId, organizationId, isDeleted: false });
    if (!boq) {
      return notFoundResponse('BOQ not found');
    }

    // Verify at least one item exists
    const itemCount = await BOQItem.countDocuments({ boqId: boq._id, isDeleted: false });

    switch (action) {
      case 'submit': {
        if (boq.status !== 'draft' && boq.status !== 'rejected') {
          return errorResponse('Only draft or rejected BOQs can be submitted for approval', 400);
        }
        if (itemCount === 0) {
          return errorResponse('Cannot submit a BOQ with no items', 400);
        }
        boq.status = 'pending_approval';
        boq.submittedBy = auth.userId as any;
        boq.submittedAt = new Date();
        // Clear previous rejection if resubmitting
        boq.rejectedBy = undefined;
        boq.rejectedAt = undefined;
        boq.rejectionReason = undefined;
        break;
      }
      case 'approve': {
        if (boq.status !== 'pending_approval') {
          return errorResponse('Only pending BOQs can be approved', 400);
        }
        boq.status = 'approved';
        boq.approvedBy = auth.userId as any;
        boq.approvedAt = new Date();
        break;
      }
      case 'reject': {
        if (boq.status !== 'pending_approval') {
          return errorResponse('Only pending BOQs can be rejected', 400);
        }
        if (!reason) {
          return errorResponse('Rejection reason is required', 400);
        }
        boq.status = 'rejected';
        boq.rejectedBy = auth.userId as any;
        boq.rejectedAt = new Date();
        boq.rejectionReason = reason;
        break;
      }
    }

    await boq.save();

    const updatedBoq = await BOQ.findById(boq._id)
      .populate('createdBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('submittedBy', 'firstName lastName email')
      .populate('rejectedBy', 'firstName lastName email');

    return successResponse(updatedBoq, `BOQ ${action === 'submit' ? 'submitted for approval' : action === 'approve' ? 'approved' : 'rejected'} successfully`);
  } catch (error) {
    console.error('BOQ approval error:', error);
    return serverErrorResponse();
  }
}

export const POST = withAuth(approvalHandler);
