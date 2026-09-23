// =============================================================================
// InteriorOS Backend — CRM Drawing Internal Approval API
// Allows project managers/team leads to approve or reject drawing uploads
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

async function approveDrawingHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { customerId, drawingId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return errorResponse('Invalid customer ID', 400);
    }

    let customer = await CrmCustomer.findOne({ _id: customerId, organizationId });
    if (!customer) {
      customer = await CrmCustomer.findById(customerId);
    }
    if (!customer) {
      return errorResponse('Customer/Lead not found', 404);
    }

    const body = await req.json().catch(() => ({}));
    const {
      action = 'approve', // 'approve' | 'reject'
      versionNumber,
      internalNotes = '',
    } = body;

    const drawingList = customer.designFiles || (customer as any).designs || [];
    const drawing = drawingList.find(
      (d: any, idx: number) =>
        d._id?.toString() === drawingId ||
        d.id?.toString() === drawingId ||
        String(d._id) === String(drawingId) ||
        String(d.id) === String(drawingId) ||
        d.name === drawingId ||
        d.title === drawingId ||
        d.url === drawingId ||
        String(idx) === String(drawingId)
    );
    if (!drawing) {
      return errorResponse('Drawing file not found', 404);
    }

    // Find version
    let targetVersion = (drawing.versions || []).find(
      (v: any) => versionNumber ? v.versionNumber === Number(versionNumber) : v.versionNumber === drawing.currentVersion
    );

    // If drawing had no versions array populated yet, create v1
    if (!targetVersion) {
      if (!drawing.versions) drawing.versions = [];
      targetVersion = {
        versionNumber: drawing.currentVersion || 1,
        name: drawing.title || drawing.name,
        url: drawing.url,
        fileType: drawing.fileType,
        category: drawing.category || '2D',
        uploadedAt: drawing.uploadedAt || new Date(),
        approvalStatus: 'pending_internal_approval',
      };
      drawing.versions.push(targetVersion as any);
    }

    const reviewerId = new mongoose.Types.ObjectId(auth.userId);

    if (action === 'approve') {
      targetVersion.approvalStatus = 'internally_approved';
      targetVersion.approvedBy = reviewerId;
      targetVersion.approvedAt = new Date();
      targetVersion.internalNotes = internalNotes;
      targetVersion.rejectionReason = undefined;
      targetVersion.clientStatus = 'pending_client_review';

      drawing.status = 'internally_approved';
      drawing.rejectionReason = undefined;
      drawing.url = targetVersion.url;
      drawing.name = targetVersion.name;
      drawing.fileType = targetVersion.fileType;
    } else {
      targetVersion.approvalStatus = 'internally_rejected';
      targetVersion.approvedBy = reviewerId;
      targetVersion.approvedAt = new Date();
      targetVersion.internalNotes = internalNotes;
      targetVersion.rejectionReason = internalNotes;

      drawing.status = 'internally_rejected';
      drawing.internalNotes = internalNotes;
      drawing.rejectionReason = internalNotes;
    }

    await customer.save();

    // Log Activity
    await CrmActivity.create({
      organizationId,
      customer: customer._id,
      user: reviewerId,
      type: '2D/3D Drawing',
      status: 'Completed',
      remarks: `${action === 'approve' ? 'Approved' : 'Rejected'} drawing "${drawing.name}" (Version v${targetVersion.versionNumber})${internalNotes ? ': ' + internalNotes : ''}`,
    }).catch(() => null);

    return successResponse({
      drawing,
      customer,
      message: `Drawing version v${targetVersion.versionNumber} ${action === 'approve' ? 'internally approved and published to share portal' : 'internally rejected'}.`,
    });
  } catch (error) {
    console.error('Error in drawing approval:', error);
    return serverErrorResponse('Failed to process drawing approval');
  }
}

export const POST = withAuth(approveDrawingHandler);
