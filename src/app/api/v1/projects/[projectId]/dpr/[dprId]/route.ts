// =============================================================================
// InteriorOS Backend — Single DPR API Route (GET, DELETE, PUT)
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { DailyProgressReport } from '@/models/dpr.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve a specific DPR
async function getDprByIdHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, dprId } = await context.params;

    const report = await DailyProgressReport.findOne({ _id: dprId, projectId, organizationId })
      .populate('projectId', 'name code client location')
      .populate('submittedBy', 'firstName lastName email avatar');

    if (!report) {
      return notFoundResponse('Daily Progress Report not found');
    }

    return successResponse(report);
  } catch (error) {
    console.error('Get DPR error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Delete a specific DPR
async function deleteDprHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, dprId } = await context.params;

    const report = await DailyProgressReport.findOneAndDelete({ _id: dprId, projectId, organizationId });

    if (!report) {
      return notFoundResponse('Daily Progress Report not found');
    }

    return successResponse({ deleted: true, id: dprId }, 'Daily Progress Report deleted successfully');
  } catch (error) {
    console.error('Delete DPR error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getDprByIdHandler);
export const DELETE = withAuth(deleteDprHandler);
