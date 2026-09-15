// =============================================================================
// InteriorOS Backend — SuperAdmin API: Single Subscription Plan (Get/Update/Delete)
// =============================================================================

import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { withSuperAdmin } from '@/middlewares/superadmin.middleware';
import { connectDB } from '@/lib/db';
import { SubscriptionPlan } from '@/models/subscription-plan.model';
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

/**
 * GET /api/v1/superadmin/plans/[planId] — Get a single plan
 */
export const GET = withSuperAdmin(
  async (_req: NextRequest, context: { params: Promise<Record<string, string>> }, _auth: JwtPayload) => {
    try {
      const { planId } = await context.params;
      if (!mongoose.Types.ObjectId.isValid(planId)) {
        return notFoundResponse('Plan not found');
      }

      await connectDB();
      const plan = await SubscriptionPlan.findById(planId).lean();

      if (!plan) {
        return notFoundResponse('Plan not found');
      }

      return successResponse({ plan }, 'Plan retrieved successfully');
    } catch (error) {
      console.error('Get plan error:', error);
      return serverErrorResponse();
    }
  }
);

/**
 * PUT /api/v1/superadmin/plans/[planId] — Update a plan
 */
export const PUT = withSuperAdmin(
  async (req: NextRequest, context: { params: Promise<Record<string, string>> }, _auth: JwtPayload) => {
    try {
      const { planId } = await context.params;
      if (!mongoose.Types.ObjectId.isValid(planId)) {
        return notFoundResponse('Plan not found');
      }

      const body = await req.json();

      await connectDB();
      const plan = await SubscriptionPlan.findByIdAndUpdate(
        planId,
        {
          ...(body.name && { name: body.name }),
          ...(body.slug && { slug: body.slug }),
          ...(body.description && { description: body.description }),
          ...(body.price && { price: body.price }),
          ...(body.currency && { currency: body.currency }),
          ...(body.billingCycle && { billingCycle: body.billingCycle }),
          ...(body.features && { features: body.features }),
          ...(body.limits && { limits: body.limits }),
          ...(body.trialDays !== undefined && { trialDays: body.trialDays }),
          ...(body.isPopular !== undefined && { isPopular: body.isPopular }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        },
        { returnDocument: 'after', runValidators: true }
      ).lean();

      if (!plan) {
        return notFoundResponse('Plan not found');
      }

      return successResponse({ plan }, 'Plan updated successfully');
    } catch (error) {
      console.error('Update plan error:', error);
      return serverErrorResponse();
    }
  }
);

/**
 * DELETE /api/v1/superadmin/plans/[planId] — Soft-delete (deactivate) a plan
 */
export const DELETE = withSuperAdmin(
  async (_req: NextRequest, context: { params: Promise<Record<string, string>> }, _auth: JwtPayload) => {
    try {
      const { planId } = await context.params;
      if (!mongoose.Types.ObjectId.isValid(planId)) {
        return notFoundResponse('Plan not found');
      }

      await connectDB();
      const plan = await SubscriptionPlan.findByIdAndUpdate(
        planId,
        { isActive: false },
        { returnDocument: 'after' }
      ).lean();

      if (!plan) {
        return notFoundResponse('Plan not found');
      }

      return successResponse({ plan }, 'Plan deactivated successfully');
    } catch (error) {
      console.error('Delete plan error:', error);
      return serverErrorResponse();
    }
  }
);
