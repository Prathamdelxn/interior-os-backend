// =============================================================================
// InteriorOS Backend — Milestones API: GET, PUT, DELETE by ID
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Milestone } from '@/models/milestone.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

import { Task } from '@/models/task.model';

const updateMilestoneSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  dueDate: z.string().transform((val) => new Date(val)).optional(),
  status: z.enum(['planned', 'achieved', 'delayed']).optional(),
  linkedTasks: z.array(z.string()).optional(),
});

// GET: Get milestone detail
async function getMilestoneDetailsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, milestoneId } = await context.params;

    const milestone = await Milestone.findOne({ _id: milestoneId, projectId, organizationId, isDeleted: false })
      .populate('linkedTasks', 'name status progress');

    if (!milestone) {
      return notFoundResponse('Milestone not found');
    }

    const activeTasks = (milestone.linkedTasks || []).filter(Boolean) as any[];

    // Sync computed status based on active linked tasks
    let computedStatus = milestone.status;
    if (activeTasks.length > 0) {
      const allCompleted = activeTasks.every((t: any) => t.status === 'completed');
      if (allCompleted) {
        computedStatus = 'achieved';
      } else {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const due = new Date(milestone.dueDate);
        due.setHours(0, 0, 0, 0);
        computedStatus = due < now ? 'delayed' : 'planned';
      }
    } else {
      if (milestone.status !== 'achieved') {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const due = new Date(milestone.dueDate);
        due.setHours(0, 0, 0, 0);
        computedStatus = due < now ? 'delayed' : 'planned';
      }
    }

    if (computedStatus !== milestone.status) {
      milestone.status = computedStatus as any;
      await milestone.save();
    }

    const completedCount = activeTasks.filter((t: any) => t.status === 'completed').length;
    const progress = activeTasks.length > 0 ? Math.round((completedCount / activeTasks.length) * 100) : (computedStatus === 'achieved' ? 100 : 0);

    return successResponse({
      ...milestone.toJSON(),
      linkedTasks: activeTasks,
      status: computedStatus,
      progress,
    });
  } catch (error) {
    console.error('Get milestone details error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update milestone details
async function updateMilestoneHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, milestoneId } = await context.params;
    const body = await req.json();

    const validation = updateMilestoneSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const updateData: any = { ...validation.data };

    // Validate linked tasks if provided
    if (updateData.linkedTasks !== undefined && updateData.linkedTasks.length > 0) {
      const validCount = await Task.countDocuments({
        _id: { $in: updateData.linkedTasks },
        projectId,
        organizationId,
        isDeleted: false,
      });
      if (validCount !== updateData.linkedTasks.length) {
        return errorResponse('One or more linked tasks do not exist in this project', 400);
      }
    }

    const milestone = await Milestone.findOneAndUpdate(
      { _id: milestoneId, projectId, organizationId, isDeleted: false },
      { $set: updateData },
      { returnDocument: 'after' }
    ).populate('linkedTasks', 'name status progress');

    if (!milestone) {
      return notFoundResponse('Milestone not found');
    }

    const activeTasks = (milestone.linkedTasks || []).filter(Boolean) as any[];

    // Sync computed status based on active linked tasks
    let computedStatus = milestone.status;
    if (activeTasks.length > 0) {
      const allCompleted = activeTasks.every((t: any) => t.status === 'completed');
      if (allCompleted) {
        computedStatus = 'achieved';
      } else {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const due = new Date(milestone.dueDate);
        due.setHours(0, 0, 0, 0);
        computedStatus = due < now ? 'delayed' : 'planned';
      }
    } else {
      if (milestone.status !== 'achieved') {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const due = new Date(milestone.dueDate);
        due.setHours(0, 0, 0, 0);
        computedStatus = due < now ? 'delayed' : 'planned';
      }
    }

    if (computedStatus !== milestone.status) {
      milestone.status = computedStatus as any;
      await milestone.save();
    }

    const completedCount = activeTasks.filter((t: any) => t.status === 'completed').length;
    const progress = activeTasks.length > 0 ? Math.round((completedCount / activeTasks.length) * 100) : (computedStatus === 'achieved' ? 100 : 0);

    return successResponse({
      ...milestone.toJSON(),
      linkedTasks: activeTasks,
      status: computedStatus,
      progress,
    }, 'Milestone updated successfully');
  } catch (error) {
    console.error('Update milestone error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft delete milestone
async function deleteMilestoneHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, milestoneId } = await context.params;

    const milestone = await Milestone.findOneAndUpdate(
      { _id: milestoneId, projectId, organizationId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!milestone) {
      return notFoundResponse('Milestone not found');
    }

    return successResponse(null, 'Milestone deleted successfully');
  } catch (error) {
    console.error('Delete milestone error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('milestones', 'read', getMilestoneDetailsHandler);
export const PUT = withProjectPermission('milestones', 'update', updateMilestoneHandler);
export const DELETE = withProjectPermission('milestones', 'delete', deleteMilestoneHandler);
