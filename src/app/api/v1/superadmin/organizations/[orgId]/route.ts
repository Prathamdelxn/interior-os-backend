// =============================================================================
// InteriorOS Backend — SuperAdmin API: Single Organization (Get/Update)
// =============================================================================

import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { withSuperAdmin } from '@/middlewares/superadmin.middleware';
import { connectDB } from '@/lib/db';
import { Organization } from '@/models/organization.model';
import { User } from '@/models/user.model';
import { Project } from '@/models/project.model';
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

/**
 * GET /api/v1/superadmin/organizations/[orgId] — Get org details with stats
 */
export const GET = withSuperAdmin(
  async (_req: NextRequest, context: { params: Promise<Record<string, string>> }, _auth: JwtPayload) => {
    try {
      const { orgId } = await context.params;
      if (!mongoose.Types.ObjectId.isValid(orgId)) {
        return notFoundResponse('Organization not found');
      }

      await connectDB();

      const organization = await Organization.findOne({
        _id: orgId,
        isDeleted: false,
      })
        .populate('subscription.planId')
        .lean();

      if (!organization) {
        return notFoundResponse('Organization not found');
      }

      // Aggregate stats
      const [userCount, projectCount, recentUsers] = await Promise.all([
        User.countDocuments({ organizationId: orgId, isDeleted: false }),
        Project.countDocuments({ organizationId: orgId, isDeleted: false }),
        User.find({ organizationId: orgId, isDeleted: false })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('firstName lastName email systemRole status createdAt avatar')
          .lean(),
      ]);

      return successResponse(
        {
          organization: {
            ...organization,
            userCount,
            projectCount,
            recentUsers,
          },
        },
        'Organization retrieved successfully'
      );
    } catch (error) {
      console.error('Get organization error:', error);
      return serverErrorResponse();
    }
  }
);

/**
 * PUT /api/v1/superadmin/organizations/[orgId] — Update org (plan, status, etc.)
 */
export const PUT = withSuperAdmin(
  async (req: NextRequest, context: { params: Promise<Record<string, string>> }, _auth: JwtPayload) => {
    try {
      const { orgId } = await context.params;
      if (!mongoose.Types.ObjectId.isValid(orgId)) {
        return notFoundResponse('Organization not found');
      }

      const body = await req.json();

      await connectDB();

      // Build update object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: any = {};

      if (body.isActive !== undefined) {
        update.isActive = body.isActive;
      }

      if (body.subscription) {
        if (body.subscription.plan) update['subscription.plan'] = body.subscription.plan;
        if (body.subscription.planId) update['subscription.planId'] = body.subscription.planId;
        if (body.subscription.status) update['subscription.status'] = body.subscription.status;
        if (body.subscription.trialEndsAt) update['subscription.trialEndsAt'] = new Date(body.subscription.trialEndsAt);
        if (body.subscription.currentPeriodEnd) update['subscription.currentPeriodEnd'] = new Date(body.subscription.currentPeriodEnd);
      }

      const organization = await Organization.findOneAndUpdate(
        { _id: orgId, isDeleted: false },
        { $set: update },
        { returnDocument: 'after', runValidators: true }
      ).lean();

      if (!organization) {
        return notFoundResponse('Organization not found');
      }

      return successResponse({ organization }, 'Organization updated successfully');
    } catch (error) {
      console.error('Update organization error:', error);
      return serverErrorResponse();
    }
  }
);
