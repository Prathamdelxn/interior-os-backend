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

    const { drawingId, status, fileUrl, url, changes, revisionName, revision, title, discipline, drawingType, fileType, annotations } = body;
    if (!drawingId) {
      return errorResponse('drawingId is required', 400);
    }

    const query: any = {};
    if (organizationId) query.organizationId = organizationId;
    if (projectId) query.projectId = projectId;

    if (mongoose.Types.ObjectId.isValid(drawingId)) {
      query.$or = [{ _id: new mongoose.Types.ObjectId(drawingId) }, { drawingNumber: drawingId }];
    } else {
      query.$or = [{ drawingNumber: drawingId }, { title: drawingId }];
    }

    let drawing = await Drawing.findOne(query);
    if (!drawing && mongoose.Types.ObjectId.isValid(drawingId)) {
      drawing = await Drawing.findById(drawingId);
    }

    if (!drawing) {
      return notFoundResponse('Drawing not found');
    }

    const effectiveFileUrl = fileUrl || url;
    const effectiveRevName = revisionName || revision;

    const updatePayload: any = {};
    if (title) updatePayload.title = title;
    if (discipline) updatePayload.discipline = discipline;
    if (drawingType) updatePayload.drawingType = drawingType;
    if (fileType) updatePayload.fileType = fileType;
    if (status) updatePayload.status = status;
    if (annotations !== undefined) updatePayload.annotations = annotations;

    // If uploading a new revision
    if (effectiveFileUrl && effectiveRevName) {
      const newRev = {
        revision: effectiveRevName,
        url: effectiveFileUrl,
        uploadedBy: new mongoose.Types.ObjectId(auth.userId),
        changes: changes || '',
        createdAt: new Date(),
      };
      updatePayload.$push = { revisions: newRev };
      updatePayload.status = 'submitted';
    }

    const updatedDrawing = await Drawing.findByIdAndUpdate(
      drawing._id,
      updatePayload.$push ? { $set: updatePayload, $push: updatePayload.$push } : { $set: updatePayload },
      { new: true, runValidators: false }
    );

    return successResponse(updatedDrawing || drawing, 'Drawing updated successfully');
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

    const query: any = { projectId, organizationId };
    if (mongoose.Types.ObjectId.isValid(drawingId)) {
      query.$or = [{ _id: new mongoose.Types.ObjectId(drawingId) }, { drawingNumber: drawingId }];
    } else {
      query.$or = [{ drawingNumber: drawingId }, { title: drawingId }];
    }

    const drawing = await Drawing.findOneAndUpdate(
      query,
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
