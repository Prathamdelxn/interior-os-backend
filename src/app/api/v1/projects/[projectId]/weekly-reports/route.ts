// =============================================================================
// InteriorOS Backend — Weekly Reports API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { WeeklyReport } from '@/models/weekly-report.model';
import { Task } from '@/models/task.model';
import { Milestone } from '@/models/milestone.model';
import { Risk } from '@/models/risk.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: List all weekly reports
async function getWeeklyReportsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const reports = await WeeklyReport.find({ projectId, organizationId }).sort({ weekStart: -1 });
    return successResponse(reports);
  } catch (error) {
    console.error('Get Weekly Reports error:', error);
    return serverErrorResponse();
  }
}

// POST: Auto-generate or manually submit a weekly report
async function createWeeklyReportHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { weekStart, weekEnd } = body;
    if (!weekStart || !weekEnd) {
      return errorResponse('weekStart and weekEnd dates are required', 400);
    }

    // Auto-aggregation logic if fields are empty
    let completedActivities = body.completedActivities || [];
    let delayedActivities = body.delayedActivities || [];
    let risks = body.risks || [];
    let nextWeekPlan = body.nextWeekPlan || [];

    if (completedActivities.length === 0) {
      // Find tasks completed in this timeframe
      const doneTasks = await Task.find({
        projectId,
        organizationId,
        isDeleted: false,
        status: 'completed',
        updatedAt: { $gte: new Date(weekStart), $lte: new Date(weekEnd) },
      }).populate('packageId', 'name trade').populate('assignees', 'firstName lastName name email');
      completedActivities = doneTasks.map(t => {
        const pkgName = (t.packageId as any)?.name ? `[${(t.packageId as any).name}] ` : '';
        const assignees = (t.assignees as any[])?.map(a => `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.name || a.email).filter(Boolean).join(', ');
        const assigneeStr = assignees ? ` (Assigned: ${assignees})` : '';
        return `${pkgName}${t.name} (100% Completed)${assigneeStr}`;
      });
    }

    if (delayedActivities.length === 0) {
      // Find delayed/overdue tasks
      const lateTasks = await Task.find({
        projectId,
        organizationId,
        isDeleted: false,
        status: { $ne: 'completed' },
        endDate: { $lte: new Date(weekEnd) },
      }).populate('packageId', 'name trade').populate('assignees', 'firstName lastName name email');
      delayedActivities = lateTasks.map(t => {
        const pkgName = (t.packageId as any)?.name ? `[${(t.packageId as any).name}] ` : '';
        const assignees = (t.assignees as any[])?.map(a => `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.name || a.email).filter(Boolean).join(', ');
        const assigneeStr = assignees ? ` • Assigned: ${assignees}` : '';
        const dueStr = t.endDate ? ` (Due: ${new Date(t.endDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })})` : '';
        return `${pkgName}${t.name}${dueStr}${assigneeStr}`;
      });
    }

    if (risks.length === 0) {
      // Find open risks
      const activeRisks = await Risk.find({
        projectId,
        organizationId,
        status: 'open',
      });
      risks = activeRisks.map(r => `${r.description}${r.impact ? ` (${r.impact} impact)` : ''}`);
    }

    if (nextWeekPlan.length === 0) {
      // Find todo/in_progress tasks
      const upcomingTasks = await Task.find({
        projectId,
        organizationId,
        isDeleted: false,
        status: { $in: ['todo', 'in_progress'] },
      }).populate('packageId', 'name trade').populate('assignees', 'firstName lastName name email').limit(10);
      nextWeekPlan = upcomingTasks.map(t => {
        const pkgName = (t.packageId as any)?.name ? `[${(t.packageId as any).name}] ` : '';
        const assignees = (t.assignees as any[])?.map(a => `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.name || a.email).filter(Boolean).join(', ');
        const assigneeStr = assignees ? ` • Assigned: ${assignees}` : '';
        const progStr = t.progress ? ` (${t.progress}% ongoing)` : ' (Scheduled)';
        return `Execute ${pkgName}${t.name}${progStr}${assigneeStr}`;
      });
    }

    const report = new WeeklyReport({
      projectId,
      organizationId,
      weekStart: new Date(weekStart),
      weekEnd: new Date(weekEnd),
      completedActivities,
      delayedActivities,
      risks,
      nextWeekPlan,
      submittedBy: auth.userId,
    });

    await report.save();
    return createdResponse(report, 'Weekly progress report generated and saved successfully');
  } catch (error: any) {
    if (error.code === 11000) {
      return errorResponse('A weekly report has already been logged for this period start date', 400);
    }
    console.error('Create Weekly Report error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getWeeklyReportsHandler);
export const POST = withAuth(createWeeklyReportHandler);
