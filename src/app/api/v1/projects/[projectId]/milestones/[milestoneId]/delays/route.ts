// =============================================================================
// InteriorOS Backend — Milestone Delays API: Log Delay
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Milestone, MilestoneDelay } from '@/models/milestone.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const createDelaySchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  impactDays: z.number().int().positive('Impact days must be positive'),
  originalDate: z.string().transform((val) => new Date(val)),
  newDate: z.string().transform((val) => new Date(val)),
});

// POST: Log a delay for a milestone
async function logDelayHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, milestoneId } = await context.params;
    const body = await req.json();

    const validation = createDelaySchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { reason, impactDays, originalDate, newDate } = validation.data;

    // Check if milestone exists
    const milestone = await Milestone.findOne({ _id: milestoneId, projectId, organizationId, isDeleted: false });
    if (!milestone) {
      return notFoundResponse('Milestone not found');
    }

    // Log the delay
    const delay = new MilestoneDelay({
      organizationId,
      projectId,
      milestoneId,
      reason,
      impactDays,
      originalDate,
      newDate,
      approvedBy: auth.userId,
      status: 'approved', // Auto-approved for this phase
    });
    await delay.save();

    // Update milestone due date and status
    milestone.dueDate = newDate;
    milestone.status = 'delayed';
    await milestone.save();

    return successResponse({ delay, milestone }, 'Milestone delay logged successfully');
  } catch (error) {
    console.error('Log milestone delay error:', error);
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('milestones', 'update', logDelayHandler);
