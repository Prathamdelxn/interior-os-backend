// =============================================================================
// InteriorOS Backend — CRM Upload Drawing Version API
// Uploads a new revision version (v2, v3...) for a drawing addressing rejection/feedback
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

async function uploadDrawingVersionHandler(
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

    const body = await req.json();
    const {
      name,
      url,
      fileType = 'image',
      category = '2D',
      internalNotes = '',
      assignedReviewer,
      assignedReviewerName,
    } = body;

    if (!url || !name) {
      return errorResponse('File name and URL are required', 400);
    }

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

    if (!drawing.versions) {
      drawing.versions = [];
      // initialize existing as v1 if needed
      drawing.versions.push({
        versionNumber: 1,
        name: drawing.title || drawing.name,
        url: drawing.url,
        fileType: drawing.fileType,
        category: drawing.category,
        uploadedAt: drawing.uploadedAt || new Date(),
        approvalStatus: drawing.status === 'internally_approved' ? 'internally_approved' : 'pending_internal_approval',
      } as any);
    }

    const nextVersionNumber = (drawing.versions.length > 0
      ? Math.max(...drawing.versions.map((v: any) => v.versionNumber || 1))
      : 1) + 1;

    const uploaderId = new mongoose.Types.ObjectId(auth.userId);
    const reviewerObjId = assignedReviewer && mongoose.Types.ObjectId.isValid(assignedReviewer) ? new mongoose.Types.ObjectId(assignedReviewer) : undefined;

    const newVersion: any = {
      versionNumber: nextVersionNumber,
      name,
      url,
      fileType,
      category,
      uploadedBy: uploaderId,
      uploadedAt: new Date(),
      approvalStatus: 'pending_internal_approval',
      assignedReviewer: reviewerObjId,
      assignedReviewerName: assignedReviewerName,
      internalNotes,
      clientStatus: 'pending_client_review',
    };

    drawing.versions.push(newVersion);
    drawing.currentVersion = nextVersionNumber;
    drawing.status = 'pending_internal_approval';
    drawing.rejectionReason = undefined;
    drawing.internalNotes = internalNotes;
    if (reviewerObjId) {
      drawing.assignedReviewer = reviewerObjId;
      drawing.assignedReviewerName = assignedReviewerName;
    }
    // Don't update top-level url yet until internal team approves this new version!

    await customer.save();

    // Log Activity for Reviewer / Team
    await CrmActivity.create({
      organizationId,
      customer: customer._id,
      user: reviewerObjId || uploaderId,
      type: '2D/3D Drawing',
      status: 'Pending',
      remarks: `Uploaded Revision Version v${nextVersionNumber} for "${drawing.name}" — Sent for review to ${assignedReviewerName || 'internal team'}${internalNotes ? ': ' + internalNotes : ''}`,
    }).catch(() => null);

    return successResponse({
      drawing,
      newVersion,
      customer,
      message: `Version v${nextVersionNumber} uploaded successfully. Sent for internal team review.`,
    });
  } catch (error) {
    console.error('Error uploading drawing version:', error);
    return serverErrorResponse('Failed to upload drawing version');
  }
}

export const POST = withAuth(uploadDrawingVersionHandler);
