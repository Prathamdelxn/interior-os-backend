// =============================================================================
// InteriorOS Backend — Milestones API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Milestone, MilestoneDelay } from '@/models/milestone.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

import { Task } from '@/models/task.model';

const createMilestoneSchema = z.object({
  name: z.string().min(1, 'Milestone name is required').max(100),
  dueDate: z.string().transform((val) => new Date(val)),
  linkedTasks: z.array(z.string()).optional().default([]),
});

// GET: Retrieve milestones for a project
async function getMilestonesHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    // Fetch active tasks for this project to check against
    const activeTasksList = await Task.find({ projectId, organizationId, isDeleted: false })
      .select('_id name status progress isMilestone')
      .lean();
    const activeTaskIdSet = new Set(activeTasksList.map((t: any) => String(t._id)));

    const milestones = await Milestone.find({ projectId, organizationId, isDeleted: false })
      .populate('linkedTasks', 'name status progress isDeleted')
      .sort({ dueDate: 1 });

    // For each milestone, query its delays and sync status if linked tasks exist
    const enrichedMilestones: any[] = [];

    for (const milestone of milestones) {
      // Safely filter out any soft-deleted, null, or non-existent populated tasks
      const activeTasks = ((milestone.linkedTasks || []) as any[]).filter(
        (t: any) => t && !t.isDeleted && activeTaskIdSet.has(String(t._id || t))
      );

      // If this milestone was linked to tasks, but all of them are now deleted or removed,
      // soft-delete this orphaned milestone
      if (milestone.linkedTasks && milestone.linkedTasks.length > 0 && activeTasks.length === 0) {
        await Milestone.updateOne(
          { _id: milestone._id },
          { $set: { isDeleted: true, deletedAt: new Date(), linkedTasks: [] } }
        );
        continue;
      }

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
        await Milestone.updateOne({ _id: milestone._id }, { $set: { status: computedStatus } });
      }

      const delays = await MilestoneDelay.find({ milestoneId: milestone._id, projectId, organizationId })
        .populate('approvedBy', 'firstName lastName')
        .sort({ createdAt: -1 });

      const completedCount = activeTasks.filter((t: any) => t.status === 'completed').length;
      const progress = activeTasks.length > 0 ? Math.round((completedCount / activeTasks.length) * 100) : (computedStatus === 'achieved' ? 100 : 0);

      enrichedMilestones.push({
        ...milestone.toJSON(),
        linkedTasks: activeTasks,
        status: computedStatus,
        progress,
        delays,
      });
    }

    return successResponse(enrichedMilestones);
  } catch (error) {
    console.error('List milestones error:', error);
    return serverErrorResponse();
  }
}

// POST: Create a milestone
async function createMilestoneHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = createMilestoneSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { name, dueDate, linkedTasks } = validation.data;

    // Validate linked tasks belong to this project
    if (linkedTasks && linkedTasks.length > 0) {
      const validCount = await Task.countDocuments({
        _id: { $in: linkedTasks },
        projectId,
        organizationId,
        isDeleted: false,
      });
      if (validCount !== linkedTasks.length) {
        return errorResponse('One or more linked tasks do not exist in this project', 400);
      }
    }

    const milestone = new Milestone({
      name,
      dueDate,
      linkedTasks,
      projectId,
      organizationId,
      status: 'planned',
    });

    await milestone.save();
    return createdResponse(milestone, 'Milestone created successfully');
  } catch (error) {
    console.error('Create milestone error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('milestones', 'read', getMilestonesHandler);
export const POST = withProjectPermission('milestones', 'create', createMilestoneHandler);
