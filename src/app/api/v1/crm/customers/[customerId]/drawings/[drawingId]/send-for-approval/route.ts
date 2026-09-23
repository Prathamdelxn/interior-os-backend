// =============================================================================
// InteriorOS Backend — CRM Send Drawing for Approval API
// Assigns a team member to review and approve a 2D/3D drawing before client sharing
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

async function sendDrawingForApprovalHandler(
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
      assignedReviewer,
      assignedReviewerName,
      notes = '',
      versionNumber,
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

    // Ensure versions array exists
    if (!drawing.versions || drawing.versions.length === 0) {
      drawing.versions = [
        {
          versionNumber: drawing.currentVersion || 1,
          name: drawing.title || drawing.name,
          url: drawing.url,
          fileType: drawing.fileType,
          category: drawing.category || '2D',
          uploadedAt: drawing.uploadedAt || new Date(),
          approvalStatus: 'pending_internal_approval',
        } as any,
      ];
    }

    const targetVersion = (drawing.versions || []).find(
      (v: any) =>
        versionNumber
          ? v.versionNumber === Number(versionNumber)
          : v.versionNumber === (drawing.currentVersion || 1)
    ) || drawing.versions[drawing.versions.length - 1];

    const reviewerObjId =
      assignedReviewer && mongoose.Types.ObjectId.isValid(assignedReviewer)
        ? new mongoose.Types.ObjectId(assignedReviewer)
        : undefined;

    // Update version & drawing status
    if (targetVersion) {
      targetVersion.approvalStatus = 'pending_internal_approval';
      if (reviewerObjId) {
        targetVersion.assignedReviewer = reviewerObjId;
        targetVersion.assignedReviewerName = assignedReviewerName;
      }
      if (notes) {
        targetVersion.internalNotes = notes;
      }
    }

    drawing.status = 'pending_internal_approval';
    (drawing as any).approvalStatus = 'pending_internal_approval';
    if (reviewerObjId) {
      drawing.assignedReviewer = reviewerObjId;
      drawing.assignedReviewerName = assignedReviewerName;
    }

    await customer.save();

    // Log Activity for Reviewer / Team
    const senderId = new mongoose.Types.ObjectId(auth.userId);
    await CrmActivity.create({
      organizationId,
      customer: customer._id,
      user: reviewerObjId || senderId,
      type: 'Drawing Review',
      status: 'Pending',
      remarks: `Drawing "${drawing.name}" (v${targetVersion?.versionNumber || 1}) sent for internal approval to ${assignedReviewerName || 'team'}${notes ? ': ' + notes : ''}`,
    }).catch(() => null);

    return successResponse({
      drawing,
      customer,
      message: `Drawing "${drawing.name}" sent for internal approval to ${assignedReviewerName || 'team member'}.`,
    });
  } catch (error) {
    console.error('Error sending drawing for approval:', error);
    return serverErrorResponse('Failed to send drawing for approval');
  }
}

export const POST = withAuth(sendDrawingForApprovalHandler);
