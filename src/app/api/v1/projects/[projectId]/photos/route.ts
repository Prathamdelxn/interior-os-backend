// =============================================================================
// InteriorOS Backend — Photos API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { SitePhoto } from '@/models/site-photo.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all site photos for the project
async function getPhotosHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const photos = await SitePhoto.find({ projectId, organizationId }).sort({ createdAt: -1 });
    return successResponse(photos);
  } catch (error) {
    console.error('Get photos error:', error);
    return serverErrorResponse();
  }
}

// POST: Add a new site photo log
async function createPhotoHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { url, category } = body;
    if (!url) {
      return errorResponse('url is required', 400);
    }

    const photo = new SitePhoto({
      ...body,
      projectId,
      organizationId,
      category: category || 'progress',
      uploadedBy: auth.userId,
    });

    await photo.save();
    return createdResponse(photo, 'Site photo logged successfully');
  } catch (error) {
    console.error('Create photo error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Delete a site photo log
async function deletePhotoHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const { searchParams } = new URL(req.url);
    const photoId = searchParams.get('photoId');

    if (!photoId) {
      return errorResponse('photoId is required', 400);
    }

    const photo = await SitePhoto.findOneAndDelete({ _id: photoId, projectId, organizationId });
    if (!photo) {
      return notFoundResponse('Site photo not found');
    }

    return successResponse(null, 'Site photo deleted successfully');
  } catch (error) {
    console.error('Delete photo error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('photos', 'read', getPhotosHandler);
export const POST = withProjectPermission('photos', 'create', createPhotoHandler);
export const DELETE = withProjectPermission('photos', 'delete', deletePhotoHandler);
