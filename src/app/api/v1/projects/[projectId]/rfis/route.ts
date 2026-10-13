// =============================================================================
// InteriorOS Backend — RFIs API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { RFI } from '@/models/rfi.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all RFIs for the project
async function getRfisHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const rfis = await RFI.find({ projectId, organizationId }).sort({ createdAt: -1 });
    return successResponse(rfis);
  } catch (error) {
    console.error('Get RFIs error:', error);
    return serverErrorResponse();
  }
}

// POST: Raise a new RFI
async function createRfiHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { subject, question } = body;
    if (!subject || !question) {
      return errorResponse('subject and question are required', 400);
    }

    const currentYear = new Date().getFullYear();
    const latestRfi = await RFI.findOne({ organizationId, isDeleted: { $in: [true, false] } })
      .sort({ createdAt: -1 })
      .select('rfiNumber')
      .lean();
    let nextNum = 1;
    if (latestRfi?.rfiNumber) {
      const match = latestRfi.rfiNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    let rfiNumber = `RFI-${currentYear}-${String(nextNum).padStart(3, '0')}`;
    let exists = await RFI.findOne({ organizationId, projectId, rfiNumber, isDeleted: { $in: [true, false] } });
    while (exists) {
      nextNum++;
      rfiNumber = `RFI-${currentYear}-${String(nextNum).padStart(3, '0')}`;
      exists = await RFI.findOne({ organizationId, projectId, rfiNumber, isDeleted: { $in: [true, false] } });
    }

    const newRfi = new RFI({
      ...body,
      rfiNumber,
      projectId,
      organizationId,
      raisedBy: auth.userId,
      assignedTo: body.assignedTo || auth.userId,
      dueDate: body.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // default 7 days
      status: 'open',
      priority: body.priority || 'medium',
    });

    await newRfi.save();
    return createdResponse(newRfi, 'RFI raised successfully');
  } catch (error) {
    console.error('Create RFI error:', error);
    return serverErrorResponse();
  }
}

// PUT: Respond to or close RFI
async function updateRfiHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { rfiId, status, response } = body;
    if (!rfiId) {
      return errorResponse('rfiId is required', 400);
    }

    const rfi = await RFI.findOne({ _id: rfiId, projectId, organizationId });
    if (!rfi) {
      return notFoundResponse('RFI not found');
    }

    if (status) {
      rfi.status = status;
    }
    
    if (response) {
      rfi.response = response;
      rfi.respondedBy = auth.userId as any;
      rfi.respondedAt = new Date();
      rfi.status = 'responded';
    }

    await rfi.save();
    return successResponse(rfi, 'RFI updated successfully');
  } catch (error) {
    console.error('Update RFI error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getRfisHandler);
export const POST = withAuth(createRfiHandler);
export const PUT = withAuth(updateRfiHandler);

// DELETE: Delete an RFI
async function deleteRfiHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const { searchParams } = new URL(req.url);
    const rfiId = searchParams.get('rfiId');

    if (!rfiId) {
      return errorResponse('rfiId is required', 400);
    }

    const rfi = await RFI.findOneAndDelete({ _id: rfiId, projectId, organizationId });
    if (!rfi) {
      return notFoundResponse('RFI not found');
    }

    return successResponse(null, 'RFI deleted successfully');
  } catch (error) {
    console.error('Delete RFI error:', error);
    return serverErrorResponse();
  }
}

export const DELETE = withAuth(deleteRfiHandler);
