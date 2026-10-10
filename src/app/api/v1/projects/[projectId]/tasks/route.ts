// =============================================================================
// InteriorOS Backend — Tasks API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/task.model';
import { Package } from '@/models/wbs.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const subtaskInputSchema = z.object({
  title: z.string().min(1, 'Subtask title is required'),
  completed: z.boolean().default(false),
  dueDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  assignedTo: z.string().optional(),
});

const createTaskSchema = z.object({
  packageId: z.string().min(1, 'Package ID is required'),
  name: z.string().min(1, 'Task name is required').max(100),
  description: z.string().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'completed']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  startDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  assignees: z.array(z.string()).optional().default([]),
  dependencies: z.array(z.string()).optional().default([]),
  subtasks: z.array(subtaskInputSchema).optional().default([]),
  progress: z.number().min(0).max(100).optional(),
  isMilestone: z.boolean().optional().default(false),
});

// GET: List all tasks for project
async function getTasksHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const searchParams = req.nextUrl.searchParams;

    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const packageId = searchParams.get('packageId');
    const assignee = searchParams.get('assignee');
    const search = searchParams.get('search');

    const query: any = { projectId, organizationId, isDeleted: false };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (packageId) query.packageId = packageId;
    if (assignee) query.assignees = assignee;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const tasks = await Task.find(query)
      .populate('assignees', 'firstName lastName email avatar designation')
      .populate('dependencies', 'name status progress')
      .sort({ createdAt: 1 })
      .lean();

    const { Area, Zone, Floor, Building, Package } = await import('@/models/wbs.model');
    const [bldgs, pkgs, areas] = await Promise.all([
      Building.find({ projectId, organizationId }).select('name').lean(),
      Package.find({ projectId, organizationId }).select('name trade').lean(),
      Area.find({ projectId, organizationId }).select('name').lean(),
    ]);

    const nodeNameMap = new Map<string, any>();
    bldgs.forEach((b: any) => nodeNameMap.set(String(b._id), { _id: String(b._id), name: b.name }));
    pkgs.forEach((p: any) => nodeNameMap.set(String(p._id), { _id: String(p._id), name: p.name, trade: p.trade }));
    areas.forEach((a: any) => nodeNameMap.set(String(a._id), { _id: String(a._id), name: a.name }));

    const formattedTasks = tasks.map((t: any) => {
      const pId = String(t.packageId?._id || t.packageId || '');
      const matched = nodeNameMap.get(pId);
      return {
        ...t,
        packageId: matched || { _id: pId, name: 'WBS Element' },
      };
    });

    return successResponse(formattedTasks);
  } catch (error) {
    console.error('List tasks error:', error);
    return serverErrorResponse();
  }
}

// POST: Create a task in WBS Package
async function createTaskHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = createTaskSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const data = validation.data;

    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      return errorResponse('Start date must be before or equal to end date', 400);
    }

    // Check if the provided ID exists in any WBS element model and fetch its date bounds
    const { Area, Zone, Floor, Building, Package } = await import('@/models/wbs.model');
    const [bldg, floor, zone, area, pkg] = await Promise.all([
      Building.findOne({ _id: data.packageId, projectId, organizationId }).select('name startDate endDate').lean(),
      Floor.findOne({ _id: data.packageId, projectId, organizationId }).select('name startDate endDate').lean(),
      Zone.findOne({ _id: data.packageId, projectId, organizationId }).select('name startDate endDate').lean(),
      Area.findOne({ _id: data.packageId, projectId, organizationId }).select('name startDate endDate').lean(),
      Package.findOne({ _id: data.packageId, projectId, organizationId }).select('name startDate endDate').lean(),
    ]);

    const wbsNode: any = bldg || floor || zone || area || pkg;
    if (!wbsNode) {
      return errorResponse('Linked WBS element not found', 404);
    }

    // Validate that task dates fall within the WBS date range
    if (wbsNode.startDate && data.startDate) {
      const wbsStart = new Date(wbsNode.startDate);
      const taskStart = new Date(data.startDate);
      wbsStart.setHours(0, 0, 0, 0);
      taskStart.setHours(0, 0, 0, 0);
      if (taskStart < wbsStart) {
        return errorResponse(
          `Activity start date cannot be earlier than WBS "${wbsNode.name}" start date (${wbsStart.toISOString().split('T')[0]})`,
          400
        );
      }
    }

    if (wbsNode.endDate && data.endDate) {
      const wbsEnd = new Date(wbsNode.endDate);
      const taskEnd = new Date(data.endDate);
      wbsEnd.setHours(23, 59, 59, 999);
      taskEnd.setHours(23, 59, 59, 999);
      if (taskEnd > wbsEnd) {
        return errorResponse(
          `Activity end date cannot be later than WBS "${wbsNode.name}" end date (${wbsEnd.toISOString().split('T')[0]})`,
          400
        );
      }
    }

    // Validate dependencies belong to the same project
    if (data.dependencies && data.dependencies.length > 0) {
      const validCount = await Task.countDocuments({
        _id: { $in: data.dependencies },
        projectId,
        organizationId,
        isDeleted: false,
      });
      if (validCount !== data.dependencies.length) {
        return errorResponse('One or more dependency tasks do not exist in this project', 400);
      }
    }

    // Calculate progress from subtasks if subtasks are supplied
    let computedProgress = data.progress ?? 0;
    if (data.subtasks && data.subtasks.length > 0) {
      const completedCount = data.subtasks.filter(s => s.completed).length;
      computedProgress = Math.round((completedCount / data.subtasks.length) * 100);
    }

    let initialStatus = data.status;
    if (computedProgress === 100 && initialStatus !== 'completed') {
      initialStatus = 'completed';
    } else if (initialStatus === 'completed' && computedProgress === 0 && (!data.subtasks || data.subtasks.length === 0)) {
      computedProgress = 100;
    }

    const task = new Task({
      ...data,
      status: initialStatus,
      progress: computedProgress,
      projectId,
      organizationId,
    });

    await task.save();

    if (data.isMilestone) {
      try {
        const { Milestone } = await import('@/models/milestone.model');
        const dueDate = task.endDate || task.startDate || new Date();
        await Milestone.create({
          organizationId,
          projectId,
          name: task.name,
          dueDate,
          status: task.status === 'completed' ? 'achieved' : 'planned',
          linkedTasks: [task._id],
        });
      } catch (mErr) {
        console.warn('Auto-create milestone for task failed:', mErr);
      }
    }

    return createdResponse(task, 'Task created successfully');
  } catch (error) {
    console.error('Create task error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('tasks', 'read', getTasksHandler);
export const POST = withProjectPermission('tasks', 'create', createTaskHandler);
