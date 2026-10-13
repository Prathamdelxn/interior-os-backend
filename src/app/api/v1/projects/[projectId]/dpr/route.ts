// =============================================================================
// InteriorOS Backend — DPR API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { DailyProgressReport } from '@/models/dpr.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all DPRs for the project
async function getDprsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const reports = await DailyProgressReport.find({ projectId, organizationId })
      .populate('projectId', 'name code client location')
      .populate('submittedBy', 'firstName lastName email avatar')
      .sort({ date: -1 });
    return successResponse(reports);
  } catch (error) {
    console.error('Get DPRs error:', error);
    return serverErrorResponse();
  }
}

// POST: Submit a new DPR
async function createDprHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    if (!body.date) {
      return errorResponse('Date is required', 400);
    }

    const newReport = new DailyProgressReport({
      ...body,
      projectId,
      organizationId,
      submittedBy: auth.userId,
    });

    await newReport.save();
    return createdResponse(newReport, 'Daily Progress Report submitted successfully');
  } catch (error: any) {
    if (error.code === 11000) {
      return errorResponse('A report has already been submitted for this date', 400);
    }
    console.error('Create DPR error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getDprsHandler);
export const POST = withAuth(createDprHandler);
