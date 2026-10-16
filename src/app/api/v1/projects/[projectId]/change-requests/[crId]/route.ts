// =============================================================================
// InteriorOS Backend — Single Change Request API (Forced Rebuild)
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { ChangeRequest, User } from '@/models';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve a single Change Request
async function getCrHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, crId } = await context.params;

    const changeRequest = await ChangeRequest.findOne({
      _id: crId,
      projectId,
      organizationId,
      isDeleted: false,
    }).populate('requestedBy', 'firstName lastName email');

    if (!changeRequest) {
      return notFoundResponse('Change request not found');
    }

    return successResponse(changeRequest);
  } catch (error) {
    console.error('Get change request error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update Change Request fields or status
async function updateCrHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, crId } = await context.params;
    const body = await req.json();

    const changeRequest = await ChangeRequest.findOne({
      _id: crId,
      projectId,
      organizationId,
      isDeleted: false,
    });

    if (!changeRequest) {
      return notFoundResponse('Change request not found');
    }

    // Direct field updates
    const fieldsToUpdate = [
      'category', 'priority', 'description', 'areaAffected',
      'currentDesign', 'proposedDesign', 'reasonForChange', 'status'
    ];
    for (const field of fieldsToUpdate) {
      if (body[field] !== undefined) {
        (changeRequest as any)[field] = body[field];
      }
    }

    // Impact assessment updates
    if (body.impactAssessment) {
      changeRequest.impactAssessment = {
        ...changeRequest.impactAssessment,
        ...body.impactAssessment
      };
    }

    // Design review updates
    if (body.designReview) {
      changeRequest.designReview = {
        designerComments: body.designReview.designerComments ?? changeRequest.designReview?.designerComments,
        updatedDrawings: body.designReview.updatedDrawings ?? changeRequest.designReview?.updatedDrawings ?? [],
        threeDRenders: body.designReview.threeDRenders ?? changeRequest.designReview?.threeDRenders ?? [],
        materialSamples: body.designReview.materialSamples ?? changeRequest.designReview?.materialSamples ?? [],
      };
    }

    await changeRequest.save();

    const populatedCr = await ChangeRequest.findById(changeRequest._id).populate('requestedBy', 'firstName lastName email');
    return successResponse(populatedCr, 'Change request updated successfully');
  } catch (error) {
    console.error('Update change request error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('change_requests', 'read', getCrHandler);
export const PUT = withProjectPermission('change_requests', 'update', updateCrHandler);
