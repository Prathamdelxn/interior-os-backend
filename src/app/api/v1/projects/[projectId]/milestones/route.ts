// =============================================================================
// InteriorOS Backend — Milestones API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission, withAnyProjectPermission } from '@/middlewares/project-auth.middleware';
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

    // Tasks and milestones in parallel
    const [activeTasksList, milestones] = await Promise.all([
      Task.find({ projectId, organizationId, isDeleted: false }).select('_id').lean(),
      Milestone.find({ projectId, organizationId, isDeleted: false })
        .populate('linkedTasks', 'name status progress isDeleted')
        .sort({ dueDate: 1 }),
    ]);
    const activeTaskIdSet = new Set(activeTasksList.map((t: any) => String(t._id)));

    // All delays for these milestones in ONE query (was one query per milestone)
    const delayRows = milestones.length
      ? await MilestoneDelay.find({ milestoneId: { $in: milestones.map((m) => m._id) }, projectId, organizationId })
          .populate('approvedBy', 'firstName lastName')
          .sort({ createdAt: -1 })
      : [];
    const delaysByMilestone = new Map<string, any[]>();
    for (const d of delayRows) {
      const k = String((d as any).milestoneId);
      const arr = delaysByMilestone.get(k);
      if (arr) arr.push(d);
      else delaysByMilestone.set(k, [d]);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = (dueDate: any) => {
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today;
    };

    // Status syncs / orphan clean-ups are collected and written in one bulk call
    const writes: any[] = [];
    const enrichedMilestones: any[] = [];

    for (const milestone of milestones) {
      // Safely filter out any soft-deleted, null, or non-existent populated tasks
      const activeTasks = ((milestone.linkedTasks || []) as any[]).filter(
        (t: any) => t && !t.isDeleted && activeTaskIdSet.has(String(t._id || t))
      );

      // Linked to tasks that are all deleted/removed → soft-delete the orphaned milestone
      if (milestone.linkedTasks && milestone.linkedTasks.length > 0 && activeTasks.length === 0) {
        writes.push({
          updateOne: { filter: { _id: milestone._id }, update: { $set: { isDeleted: true, deletedAt: new Date(), linkedTasks: [] } } },
        });
        continue;
      }

      let computedStatus = milestone.status;
      if (activeTasks.length > 0) {
        computedStatus = activeTasks.every((t: any) => t.status === 'completed')
          ? 'achieved'
          : isOverdue(milestone.dueDate) ? 'delayed' : 'planned';
      } else if (milestone.status !== 'achieved') {
        computedStatus = isOverdue(milestone.dueDate) ? 'delayed' : 'planned';
      }

      if (computedStatus !== milestone.status) {
        writes.push({ updateOne: { filter: { _id: milestone._id }, update: { $set: { status: computedStatus } } } });
      }

      const completedCount = activeTasks.filter((t: any) => t.status === 'completed').length;
      const progress = activeTasks.length > 0 ? Math.round((completedCount / activeTasks.length) * 100) : (computedStatus === 'achieved' ? 100 : 0);

      enrichedMilestones.push({
        ...milestone.toJSON(),
        linkedTasks: activeTasks,
        status: computedStatus,
        progress,
        delays: delaysByMilestone.get(String(milestone._id)) || [],
      });
    }

    if (writes.length) await Milestone.bulkWrite(writes);

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

export const GET = withAnyProjectPermission(['milestones', 'tasks'], 'read', getMilestonesHandler);
export const POST = withProjectPermission('milestones', 'create', createMilestoneHandler);
