// =============================================================================
// InteriorOS Backend — Single Weekly Report API Route (GET, DELETE)
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { WeeklyReport } from '@/models/weekly-report.model';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve single weekly report
async function getWeeklyReportByIdHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, reportId } = await context.params;

    const report = await WeeklyReport.findOne({ _id: reportId, projectId, organizationId })
      .populate('submittedBy', 'firstName lastName email avatar');

    if (!report) {
      return notFoundResponse('Weekly Progress Report not found');
    }

    return successResponse(report);
  } catch (error) {
    console.error('Get Weekly Report error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Delete weekly report
async function deleteWeeklyReportHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, reportId } = await context.params;

    const report = await WeeklyReport.findOneAndDelete({ _id: reportId, projectId, organizationId });

    if (!report) {
      return notFoundResponse('Weekly Progress Report not found');
    }

    return successResponse({ deleted: true, id: reportId }, 'Weekly Progress Report deleted successfully');
  } catch (error) {
    console.error('Delete Weekly Report error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getWeeklyReportByIdHandler);
export const DELETE = withAuth(deleteWeeklyReportHandler);
