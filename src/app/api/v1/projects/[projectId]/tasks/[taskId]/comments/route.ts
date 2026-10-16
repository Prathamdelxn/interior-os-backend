// =============================================================================
// InteriorOS Backend — Task Comments API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { TaskComment } from '@/models/task.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment text is required'),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string(),
    size: z.number().optional(),
    type: z.string().optional(),
  })).optional().default([]),
});

// GET: Retrieve comments for a task
async function getCommentsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, taskId } = await context.params;

    const comments = await TaskComment.find({ taskId, projectId, organizationId })
      .populate('userId', 'firstName lastName email avatar designation')
      .sort({ createdAt: 1 });

    return successResponse(comments);
  } catch (error) {
    console.error('List task comments error:', error);
    return serverErrorResponse();
  }
}

// POST: Add a comment to a task
async function createCommentHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, taskId } = await context.params;
    const body = await req.json();

    const validation = createCommentSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const comment = new TaskComment({
      ...validation.data,
      taskId,
      projectId,
      organizationId,
      userId: auth.userId,
    });

    await comment.save();

    // Populate user info for immediate display
    await comment.populate('userId', 'firstName lastName email avatar designation');

    return createdResponse(comment, 'Comment posted successfully');
  } catch (error) {
    console.error('Create task comment error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('tasks', 'read', getCommentsHandler);
export const POST = withProjectPermission('tasks', 'read', createCommentHandler);
