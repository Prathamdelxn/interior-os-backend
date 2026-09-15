// =============================================================================
// InteriorOS Backend — Drawings API Route
// =============================================================================

import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Drawing } from '@/models/drawing.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all drawings for the project
async function getDrawingsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const drawings = await Drawing.find({ projectId, organizationId }).sort({ createdAt: -1 });
    return successResponse(drawings);
  } catch (error) {
    console.error('Get drawings error:', error);
    return serverErrorResponse();
  }
}

// POST: Create/Upload a new drawing
async function createDrawingHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { title, discipline, fileUrl, url, drawingType, fileType } = body;
    const effectiveFileUrl = fileUrl || url;
    if (!title || !effectiveFileUrl) {
      return errorResponse('title and fileUrl are required', 400);
    }

    const type = drawingType === '3D' ? '3D' : '2D';
    const disc = discipline || (type === '3D' ? '3d-render' : 'gfc');

    const count = await Drawing.countDocuments({ organizationId, projectId });
    const drawingNumber = `DWG-${type}-${disc.toUpperCase()}-${String(count + 1).padStart(3, '0')}`;

    const newDrawing = new Drawing({
      projectId,
      organizationId,
      drawingNumber,
      title,
      drawingType: type,
      discipline: disc,
      fileType: fileType || '',
      status: 'submitted',
      revisions: [
        {
          revision: 'Rev 0',
          url: effectiveFileUrl,
          uploadedBy: new mongoose.Types.ObjectId(auth.userId),
          changes: 'Initial release',
          createdAt: new Date(),
        },
      ],
    });

    await newDrawing.save();
    return createdResponse(newDrawing, 'Drawing submitted successfully');
  } catch (error) {
    console.error('Create drawing error:', error);
    return serverErrorResponse();
  }
}

// PUT: Approve/reject or update revision
async function updateDrawingHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { drawingId, status, fileUrl, url, changes, revisionName, revision, title, discipline, drawingType, fileType } = body;
    if (!drawingId) {
      return errorResponse('drawingId is required', 400);
    }

    const drawing = await Drawing.findOne({ _id: drawingId, projectId, organizationId });
    if (!drawing) {
      return notFoundResponse('Drawing not found');
    }

    const effectiveFileUrl = fileUrl || url;
    const effectiveRevName = revisionName || revision;

    // If uploading a new revision
    if (effectiveFileUrl && effectiveRevName) {
      drawing.revisions.push({
        revision: effectiveRevName,
        url: effectiveFileUrl,
        uploadedBy: new mongoose.Types.ObjectId(auth.userId),
        changes: changes || '',
        createdAt: new Date(),
      });
      drawing.status = 'submitted';
    }

    // If updating metadata
    if (title) drawing.title = title;
    if (discipline) drawing.discipline = discipline;
    if (drawingType) drawing.drawingType = drawingType;
    if (fileType) drawing.fileType = fileType;

    // If updating approval status
    if (status) {
      drawing.status = status;
    }

    await drawing.save();
    return successResponse(drawing, 'Drawing updated successfully');
  } catch (error) {
    console.error('Update drawing error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft delete a drawing
async function deleteDrawingHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const { searchParams } = new URL(req.url);
    const drawingId = searchParams.get('drawingId');

    if (!drawingId) {
      return errorResponse('drawingId query parameter is required', 400);
    }

    const drawing = await Drawing.findOneAndUpdate(
      { _id: drawingId, projectId, organizationId },
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!drawing) {
      return notFoundResponse('Drawing not found');
    }

    return successResponse(drawing, 'Drawing deleted successfully');
  } catch (error) {
    console.error('Delete drawing error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getDrawingsHandler);
export const POST = withAuth(createDrawingHandler);
export const PUT = withAuth(updateDrawingHandler);
export const DELETE = withAuth(deleteDrawingHandler);
