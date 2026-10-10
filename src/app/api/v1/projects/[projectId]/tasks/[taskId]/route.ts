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

const materialUsageInputSchema = z.object({
  inventoryId: z.string().optional(),
  materialName: z.string().min(1, 'Material name is required'),
  quantity: z.number().min(0.001, 'Quantity must be greater than 0'),
  unit: z.string().default('units'),
  notes: z.string().optional(),
});

const completionProofInputSchema = z.object({
  images: z.array(completionProofImageSchema).default([]),
  notes: z.string().optional(),
  materialUsage: z.array(materialUsageInputSchema).optional().default([]),
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
  isMilestone: z.boolean().optional(),
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

    if (updateData.startDate && updateData.endDate && updateData.startDate > updateData.endDate) {
      return errorResponse('Start date must be before or equal to end date', 400);
    }

    const existingTask = await Task.findOne({ _id: taskId, projectId, organizationId, isDeleted: false });
    if (!existingTask) {
      return notFoundResponse('Task not found');
    }

    const targetPackageId = updateData.packageId || existingTask.packageId;
    if (targetPackageId) {
      const { Area, Zone, Floor, Building, Package } = await import('@/models/wbs.model');
      const [bldg, floor, zone, area, pkg] = await Promise.all([
        Building.findOne({ _id: targetPackageId, projectId, organizationId }).select('name startDate endDate').lean(),
        Floor.findOne({ _id: targetPackageId, projectId, organizationId }).select('name startDate endDate').lean(),
        Zone.findOne({ _id: targetPackageId, projectId, organizationId }).select('name startDate endDate').lean(),
        Area.findOne({ _id: targetPackageId, projectId, organizationId }).select('name startDate endDate').lean(),
        Package.findOne({ _id: targetPackageId, projectId, organizationId }).select('name startDate endDate').lean(),
      ]);

      const wbsNode: any = bldg || floor || zone || area || pkg;
      if (!wbsNode) {
        return errorResponse('Target WBS element not found in this project', 404);
      }

      const effectiveStartDate = updateData.startDate !== undefined ? updateData.startDate : existingTask.startDate;
      const effectiveEndDate = updateData.endDate !== undefined ? updateData.endDate : existingTask.endDate;

      if (effectiveStartDate && effectiveEndDate && effectiveStartDate > effectiveEndDate) {
        return errorResponse('Start date must be before or equal to end date', 400);
      }

      if (wbsNode.startDate && effectiveStartDate) {
        const wbsStart = new Date(wbsNode.startDate);
        const taskStart = new Date(effectiveStartDate);
        wbsStart.setHours(0, 0, 0, 0);
        taskStart.setHours(0, 0, 0, 0);
        if (taskStart < wbsStart) {
          return errorResponse(
            `Activity start date cannot be earlier than WBS "${wbsNode.name}" start date (${wbsStart.toISOString().split('T')[0]})`,
            400
          );
        }
      }

      if (wbsNode.endDate && effectiveEndDate) {
        const wbsEnd = new Date(wbsNode.endDate);
        const taskEnd = new Date(effectiveEndDate);
        wbsEnd.setHours(23, 59, 59, 999);
        taskEnd.setHours(23, 59, 59, 999);
        if (taskEnd > wbsEnd) {
          return errorResponse(
            `Activity end date cannot be later than WBS "${wbsNode.name}" end date (${wbsEnd.toISOString().split('T')[0]})`,
            400
          );
        }
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

    if (updateData.isMilestone === true) {
      try {
        const existing = await Milestone.findOne({ projectId, organizationId, linkedTasks: task._id, isDeleted: false });
        if (!existing) {
          const dueDate = task.endDate || task.startDate || new Date();
          await Milestone.create({
            organizationId,
            projectId,
            name: task.name,
            dueDate,
            status: task.status === 'completed' ? 'achieved' : 'planned',
            linkedTasks: [task._id],
          });
        } else {
          await Milestone.updateOne(
            { _id: existing._id },
            {
              $set: {
                name: task.name,
                dueDate: task.endDate || task.startDate || existing.dueDate,
                status: task.status === 'completed' ? 'achieved' : existing.status,
              }
            }
          );
        }
      } catch (mErr) {
        console.warn('Sync milestone on task update failed:', mErr);
      }
    } else if (updateData.isMilestone === false) {
      try {
        const linkedMilestones = await Milestone.find({
          projectId,
          organizationId,
          linkedTasks: task._id,
          isDeleted: false,
        });
        for (const m of linkedMilestones) {
          if (m.linkedTasks.length <= 1) {
            await Milestone.updateOne(
              { _id: m._id },
              { $set: { isDeleted: true, deletedAt: new Date(), linkedTasks: [] } }
            );
          } else {
            await Milestone.updateOne(
              { _id: m._id },
              { $pull: { linkedTasks: task._id } }
            );
          }
        }
      } catch (mErr) {
        console.warn('Remove milestone link on task update failed:', mErr);
      }
    }

    // If material usage was recorded, update corresponding inventory records
    if (updateData.completionProof?.materialUsage && Array.isArray(updateData.completionProof.materialUsage)) {
      try {
        const { Inventory } = await import('@/models/inventory.model');
        for (const mat of updateData.completionProof.materialUsage) {
          if (mat.inventoryId && mat.quantity > 0) {
            await Inventory.findOneAndUpdate(
              { _id: mat.inventoryId, projectId, organizationId },
              {
                $inc: { installedQuantity: mat.quantity },
                $push: {
                  installHistory: {
                    quantity: mat.quantity,
                    date: new Date(),
                    notes: `Used in Activity: ${task.name}${mat.notes ? ` (${mat.notes})` : ''}`,
                  },
                },
              }
            );
          }
        }
      } catch (invErr) {
        console.warn('Failed to update inventory consumption for task', invErr);
      }
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

    // Soft-delete milestones linked ONLY to this task, or unlink from multi-task milestones
    const linkedMilestones = await Milestone.find({
      projectId,
      organizationId,
      linkedTasks: taskId,
      isDeleted: false,
    });

    for (const m of linkedMilestones) {
      if (m.linkedTasks.length <= 1) {
        await Milestone.updateOne(
          { _id: m._id },
          { $set: { isDeleted: true, deletedAt: new Date(), linkedTasks: [] } }
        );
      } else {
        await Milestone.updateOne(
          { _id: m._id },
          { $pull: { linkedTasks: taskId } }
        );
      }
    }

    // Cleanup references in task dependencies
    await Task.updateMany(
      { projectId, organizationId, dependencies: taskId },
      { $pull: { dependencies: taskId } }
    );

    return successResponse(null, 'Task deleted successfully');
  } catch (error) {
    console.error('Delete task error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('tasks', 'read', getTaskDetailsHandler);
export const PUT = withProjectPermission('tasks', 'update', updateTaskHandler);
export const DELETE = withProjectPermission('tasks', 'delete', deleteTaskHandler);
