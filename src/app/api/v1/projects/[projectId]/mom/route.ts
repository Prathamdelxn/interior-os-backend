// =============================================================================
// InteriorOS Backend — MOM API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { MeetingMinutes } from '@/models/mom.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all meeting logs for the project
async function getMomsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const meetings = await MeetingMinutes.find({ projectId, organizationId }).sort({ date: -1 });
    return successResponse(meetings);
  } catch (error) {
    console.error('Get MOMs error:', error);
    return serverErrorResponse();
  }
}

// POST: Log a new meeting minutes
async function createMomHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { title, agenda, notes } = body;
    if (!title || !agenda || !notes) {
      return errorResponse('title, agenda, and notes are required', 400);
    }

    const newMeeting = new MeetingMinutes({
      ...body,
      projectId,
      organizationId,
    });

    await newMeeting.save();
    return createdResponse(newMeeting, 'Meeting minutes logged successfully');
  } catch (error) {
    console.error('Create MOM error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update meeting minutes
async function updateMomHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { momId, id, title, date, attendees, agenda, notes, actionItems, status } = body;
    const targetId = momId || id;
    if (!targetId) {
      return errorResponse('momId or id is required', 400);
    }

    const meeting = await MeetingMinutes.findOne({ _id: targetId, projectId, organizationId });
    if (!meeting) {
      return notFoundResponse('Meeting minutes not found');
    }

    if (title !== undefined) meeting.title = title;
    if (date !== undefined) meeting.date = date;
    if (attendees !== undefined) meeting.attendees = attendees;
    if (agenda !== undefined) meeting.agenda = agenda;
    if (notes !== undefined) meeting.notes = notes;
    if (actionItems !== undefined) meeting.actionItems = actionItems;
    if (status !== undefined) meeting.status = status;

    await meeting.save();
    return successResponse(meeting, 'Meeting minutes updated successfully');
  } catch (error) {
    console.error('Update MOM error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Delete meeting minutes
async function deleteMomHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const { searchParams } = new URL(req.url);
    const momId = searchParams.get('momId') || searchParams.get('id');

    if (!momId) {
      return errorResponse('momId query parameter is required', 400);
    }

    const meeting = await MeetingMinutes.findOneAndDelete({ _id: momId, projectId, organizationId });
    if (!meeting) {
      return notFoundResponse('Meeting minutes not found');
    }

    return successResponse(null, 'Meeting minutes deleted successfully');
  } catch (error) {
    console.error('Delete MOM error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('mom', 'read', getMomsHandler);
export const POST = withProjectPermission('mom', 'create', createMomHandler);
export const PUT = withProjectPermission('mom', 'update', updateMomHandler);
export const DELETE = withProjectPermission('mom', 'delete', deleteMomHandler);
