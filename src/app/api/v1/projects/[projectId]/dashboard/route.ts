// =============================================================================
// InteriorOS Backend — Project Dashboard API: Aggregated Metrics
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/project.model';
import { Task } from '@/models/task.model';
import { Milestone } from '@/models/milestone.model';
import { Snag } from '@/models/snag.model';
import { RFI } from '@/models/rfi.model';
import { Risk } from '@/models/risk.model';
import { CrmCustomer } from '@/models/crm-customer.model';
import { calculateProjectMetrics } from '@/services/project-metrics.service';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Aggregate metrics for the project dashboard
async function getProjectDashboardHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    // Check if project exists
    const project = await Project.findOne({ _id: projectId, organizationId, isDeleted: false });
    if (!project) {
      return notFoundResponse('Project not found');
    }

    // 1. Task calculations
    const allTasks = await Task.find({ projectId, organizationId, isDeleted: false }).select('status progress');
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;

    const taskBreakdown = {
      backlog: allTasks.filter(t => t.status === 'backlog').length,
      todo: allTasks.filter(t => t.status === 'todo').length,
      in_progress: allTasks.filter(t => t.status === 'in_progress').length,
      in_review: allTasks.filter(t => t.status === 'in_review').length,
      completed: completedTasks,
    };

    // 2. Milestones
    const allMilestones = await Milestone.find({ projectId, organizationId, isDeleted: false }).select('status');
    const milestoneSummary = {
      total: allMilestones.length,
      planned: allMilestones.filter(m => m.status === 'planned').length,
      achieved: allMilestones.filter(m => m.status === 'achieved').length,
      delayed: allMilestones.filter(m => m.status === 'delayed').length,
    };

    // 3. Live quality and risk counts (Snags, RFIs, Risks)
    const [openSnags, openRFIs, criticalRisks] = await Promise.all([
      Snag.countDocuments({
        projectId,
        organizationId,
        isDeleted: false,
        status: { $in: ['open', 'assigned', 'in_progress'] },
      }),
      RFI.countDocuments({
        projectId,
        organizationId,
        isDeleted: false,
        status: 'open',
      }),
      Risk.countDocuments({
        projectId,
        organizationId,
        isDeleted: false,
        status: 'open',
        score: { $gte: 6 },
      }),
    ]);

    const qualitySummary = {
      openSnags,
      openRFIs,
      criticalRisks,
    };

    // Calculate dynamic project metrics
    const metrics = await calculateProjectMetrics(projectId, organizationId, project);

    let budgetObj = project.budget || { amount: 0, currency: 'INR' };
    if (!budgetObj.amount || budgetObj.amount === 0) {
      const c = await CrmCustomer.findOne({ organizationId, linkedProject: projectId }).select('quotations boqs budgetRange').lean();
      if (c) {
        let bAmount = 0;
        if (c.quotations && c.quotations.length > 0) {
          const accepted: any = c.quotations.find((q: any) => q.status === 'Accepted' || q.status === 'Approved') || c.quotations[c.quotations.length - 1];
          bAmount = Number(accepted?.grandTotal || accepted?.totalAmount || accepted?.subtotal || accepted?.total || 0);
        }
        if (!bAmount && c.boqs && c.boqs.length > 0) {
          bAmount = Number(c.boqs[c.boqs.length - 1]?.totalAmount || 0);
        }
        if (!bAmount && c.budgetRange) {
          const cleaned = String(c.budgetRange).replace(/[^0-9.]/g, '');
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && parsed > 0) bAmount = parsed;
        }
        if (bAmount > 0) {
          budgetObj = { ...budgetObj, amount: bAmount };
        }
      }
    }

    // 4. Return combined details
    return successResponse({
      project: {
        id: project._id,
        name: project.name,
        code: project.code,
        client: project.client,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
        budget: budgetObj,
        location: project.location,
        description: project.description,
        progress: metrics.progress,
        health: metrics.health,
        healthColor: metrics.healthColor,
        healthLabel: metrics.healthLabel,
        threeDModelUrl: project.threeDModelUrl,
      },
      taskStats: {
        total: totalTasks,
        completed: completedTasks,
        remaining: totalTasks - completedTasks,
        breakdown: taskBreakdown,
      },
      milestones: milestoneSummary,
      quality: qualitySummary,
    });
  } catch (error) {
    console.error('Project dashboard error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('projects', 'read', getProjectDashboardHandler);
