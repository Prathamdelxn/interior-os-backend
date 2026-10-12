// =============================================================================
// InteriorOS Backend — Snags API Route
// =============================================================================

import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Snag } from '@/models/snag.model';
import { Drawing } from '@/models/drawing.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all snags for the project
async function getSnagsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const snags = await Snag.find({ projectId, organizationId }).sort({ createdAt: -1 });
    return successResponse(snags);
  } catch (error) {
    console.error('Get snags error:', error);
    return serverErrorResponse();
  }
}

// POST: Log a new snag
async function createSnagHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { description, photos } = body;
    if (!description) {
      return errorResponse('description is required', 400);
    }

    const cleanDrawingId = body.drawingId && mongoose.Types.ObjectId.isValid(body.drawingId) ? body.drawingId : undefined;
    const cleanAssignee = body.assignee && mongoose.Types.ObjectId.isValid(body.assignee) ? body.assignee : undefined;

    const snag = new Snag({
      ...body,
      drawingId: cleanDrawingId,
      assignee: cleanAssignee,
      projectId,
      organizationId,
      photos: Array.isArray(photos) ? photos : (photos ? [photos] : []),
      dueDate: body.dueDate || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // default 5 days
    });

    await snag.save();

    // Bi-directional sync: if linked to a drawing annotation, update the annotation's snagId
    if (cleanDrawingId && body.annotationId) {
      try {
        await Drawing.updateOne(
          { _id: cleanDrawingId, 'annotations.id': body.annotationId },
          { $set: { 'annotations.$.snagId': snag._id.toString() } }
        );
      } catch (err) {
        console.error('Failed to sync drawing annotation snagId:', err);
      }
    }

    return createdResponse(snag, 'Snag logged successfully');
  } catch (error) {
    console.error('Create snag error:', error);
    return serverErrorResponse();
  }
}

// PUT: Resolve or close snag, or edit snag details
async function updateSnagHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { snagId, status, assignee, description, location, priority, dueDate, photos, drawingId, drawingTitle, drawingNumber, annotationId, pinNumber, x, y } = body;
    if (!snagId) {
      return errorResponse('snagId is required', 400);
    }

    const snag = await Snag.findOne({ _id: snagId, projectId, organizationId });
    if (!snag) {
      return notFoundResponse('Snag not found');
    }

    if (status) snag.status = status;
    if (assignee !== undefined) snag.assignee = assignee && mongoose.Types.ObjectId.isValid(assignee) ? assignee : undefined;
    if (description !== undefined) snag.description = description;
    if (location !== undefined) snag.location = location;
    if (priority !== undefined) snag.priority = priority;
    if (dueDate !== undefined) snag.dueDate = dueDate;
    if (photos !== undefined) snag.photos = Array.isArray(photos) ? photos : (photos ? [photos] : []);
    if (drawingId !== undefined) snag.drawingId = drawingId && mongoose.Types.ObjectId.isValid(drawingId) ? drawingId : undefined;
    if (drawingTitle !== undefined) snag.drawingTitle = drawingTitle;
    if (drawingNumber !== undefined) snag.drawingNumber = drawingNumber;
    if (annotationId !== undefined) snag.annotationId = annotationId;
    if (pinNumber !== undefined) snag.pinNumber = pinNumber;
    if (x !== undefined) snag.x = x;
    if (y !== undefined) snag.y = y;

    await snag.save();

    // Bi-directional sync: if linked to a drawing annotation, update the annotation's resolved status
    if (snag.drawingId && snag.annotationId) {
      try {
        const isResolved = snag.status === 'resolved' || snag.status === 'closed' || snag.status === 'verified';
        await Drawing.updateOne(
          { _id: snag.drawingId, 'annotations.id': snag.annotationId },
          { $set: { 'annotations.$.resolved': isResolved } }
        );
      } catch (err) {
        console.error('Failed to sync drawing annotation resolution:', err);
      }
    }

    return successResponse(snag, 'Snag updated successfully');
  } catch (error) {
    console.error('Update snag error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Delete a snag
async function deleteSnagHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    
    const { searchParams } = new URL(req.url);
    const snagId = searchParams.get('snagId');
    
    if (!snagId) {
      return errorResponse('snagId query param is required', 400);
    }

    const snag = await Snag.findOneAndDelete({ _id: snagId, projectId, organizationId });
    if (!snag) {
      return notFoundResponse('Snag not found');
    }

    // Bi-directional sync: if linked to a drawing annotation, pull annotation or clear snag reference
    if (snag.drawingId && snag.annotationId) {
      try {
        await Drawing.updateOne(
          { _id: snag.drawingId },
          { $pull: { annotations: { id: snag.annotationId } } }
        );
      } catch (err) {
        console.error('Failed to remove linked drawing annotation for deleted snag:', err);
      }
    }

    return successResponse(null, 'Snag deleted successfully');
  } catch (error) {
    console.error('Delete snag error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('snags', 'read', getSnagsHandler);
export const POST = withProjectPermission('snags', 'create', createSnagHandler);
export const PUT = withProjectPermission('snags', 'update', updateSnagHandler);
export const DELETE = withProjectPermission('snags', 'delete', deleteSnagHandler);
