// =============================================================================
// InteriorOS Backend — Tasks API: GET, PUT, DELETE by ID
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/task.model';
import { Package } from '@/models/wbs.model';
import { Milestone } from '@/models/milestone.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const subtaskInputSchema = z.object({
  _id: z.string().optional(),
  title: z.string().min(1, 'Subtask title is required'),
  completed: z.boolean().default(false),
  dueDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  assignedTo: z.string().optional(),
});

const completionProofImageSchema = z.object({
  url: z.string().min(1, 'Image URL is required'),
  name: z.string().optional(),
  size: z.number().optional(),
  uploadedAt: z.string().optional().transform((val) => val ? new Date(val) : new Date()),
});

const completionProofInputSchema = z.object({
  images: z.array(completionProofImageSchema).default([]),
  notes: z.string().optional(),
  completedAt: z.string().optional().transform((val) => val ? new Date(val) : new Date()),
  completedBy: z.string().optional(),
});

const updateTaskSchema = z.object({
  packageId: z.string().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  startDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  assignees: z.array(z.string()).optional(),
  progress: z.number().min(0).max(100).optional(),
  dependencies: z.array(z.string()).optional(),
  subtasks: z.array(subtaskInputSchema).optional(),
  completionProof: completionProofInputSchema.optional(),
});

// Helper: Check for circular dependencies
async function hasCircularDependency(taskId: string, newDependencies: string[], projectId: string, organizationId: any): Promise<boolean> {
  if (newDependencies.includes(taskId)) return true;

  const allTasks = await Task.find({ projectId, organizationId, isDeleted: false }).select('_id dependencies').lean();
  const depMap = new Map<string, string[]>();
  for (const t of allTasks) {
    depMap.set(String(t._id), (t.dependencies || []).map(d => String(d)));
  }
  depMap.set(String(taskId), newDependencies.map(d => String(d)));

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(curr: string): boolean {
    if (stack.has(curr)) return true;
    if (visited.has(curr)) return false;

    visited.add(curr);
    stack.add(curr);

    const neighbors = depMap.get(curr) || [];
    for (const n of neighbors) {
      if (dfs(n)) return true;
    }

    stack.delete(curr);
    return false;
  }

  for (const startNode of newDependencies) {
    if (dfs(startNode)) return true;
  }

  return false;
}

// GET: Get task details
async function getTaskDetailsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, taskId } = await context.params;

    const task = await Task.findOne({ _id: taskId, projectId, organizationId, isDeleted: false })
      .populate('assignees', 'firstName lastName email avatar designation')
      .populate('packageId', 'name trade')
      .populate('dependencies', 'name status progress');

    if (!task) {
      return notFoundResponse('Task not found');
    }

    return successResponse(task);
  } catch (error) {
    console.error('Get task details error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update task details
async function updateTaskHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, taskId } = await context.params;
    const body = await req.json();

    const validation = updateTaskSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const updateData: any = { ...validation.data };

    // Check package if updated
    if (updateData.packageId) {
      const pkgExists = await Package.exists({ _id: updateData.packageId, projectId, organizationId });
      if (!pkgExists) {
        return errorResponse('Target WBS package not found in this project', 404);
      }
    }

    // Validate dependencies
    if (updateData.dependencies !== undefined) {
      if (updateData.dependencies.includes(taskId)) {
        return errorResponse('A task cannot depend on itself', 400);
      }

      if (updateData.dependencies.length > 0) {
        const validCount = await Task.countDocuments({
          _id: { $in: updateData.dependencies },
          projectId,
          organizationId,
          isDeleted: false,
        });
        if (validCount !== updateData.dependencies.length) {
          return errorResponse('One or more dependency tasks do not exist in this project', 400);
        }

        const isCircular = await hasCircularDependency(taskId, updateData.dependencies, projectId, organizationId);
        if (isCircular) {
          return errorResponse('Circular dependency detected. Tasks cannot form dependency loops.', 400);
        }
      }
    }

    // Auto calculate progress and transition status from subtasks if subtasks were provided
    if (updateData.subtasks !== undefined) {
      if (updateData.subtasks.length > 0) {
        const completedCount = updateData.subtasks.filter((s: any) => s.completed).length;
        updateData.progress = Math.round((completedCount / updateData.subtasks.length) * 100);
        if (updateData.progress === 100 && (!updateData.status || updateData.status !== 'completed')) {
          updateData.status = 'completed';
        } else if (updateData.progress > 0 && updateData.progress < 100) {
          updateData.status = 'in_progress';
        }
      } else if (updateData.progress === undefined) {
        // If subtasks array is cleared and no progress passed, leave as is
      }
    } else {
      // If status changed to completed and progress not passed
      if (updateData.status === 'completed' && updateData.progress === undefined) {
        updateData.progress = 100;
      }
    }

    const task = await Task.findOneAndUpdate(
      { _id: taskId, projectId, organizationId, isDeleted: false },
      { $set: updateData },
      { returnDocument: 'after' }
    ).populate('assignees', 'firstName lastName email avatar designation')
     .populate('packageId', 'name trade')
     .populate('dependencies', 'name status progress');

    if (!task) {
      return notFoundResponse('Task not found');
    }

    return successResponse(task, 'Task updated successfully');
  } catch (error) {
    console.error('Update task error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft delete task
async function deleteTaskHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, taskId } = await context.params;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, projectId, organizationId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!task) {
      return notFoundResponse('Task not found');
    }

    // Cleanup references in milestones and task dependencies
    await Promise.all([
      Milestone.updateMany(
        { projectId, organizationId, linkedTasks: taskId },
        { $pull: { linkedTasks: taskId } }
      ),
      Task.updateMany(
        { projectId, organizationId, dependencies: taskId },
        { $pull: { dependencies: taskId } }
      ),
    ]);

    return successResponse(null, 'Task deleted successfully');
  } catch (error) {
    console.error('Delete task error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('tasks', 'read', getTaskDetailsHandler);
export const PUT = withProjectPermission('tasks', 'update', updateTaskHandler);
export const DELETE = withProjectPermission('tasks', 'delete', deleteTaskHandler);
