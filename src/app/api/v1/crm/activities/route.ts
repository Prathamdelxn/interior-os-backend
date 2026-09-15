// =============================================================================
// InteriorOS Backend — CRM Activities API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, createdResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: List activities for a customer or all activities for organization
async function getActivitiesHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    const searchParams = req.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');

    const query: any = {
      organizationId,
    };

    if (customerId) {
      query.customer = customerId;
    } else {
      // For general follow-ups view, exclude Site Visit transitions and system updates
      query.type = { $nin: ['Site Visit', 'Status Change', 'System Update'] };
    }
    if (status && status !== 'all') {
      query.status = status;
    }

    const activities = await CrmActivity.find(query)
      .populate({
        path: 'customer',
        select: 'name mobileNumber status assignedSalesExecutive leadNumber projectLocation',
        populate: { path: 'assignedSalesExecutive', select: 'firstName lastName email' },
      })
      .populate('user', 'firstName lastName email')
      .sort({ updatedAt: -1, scheduledDate: -1, createdAt: -1 });

    // When querying across all customers, deduplicate so each lead appears at most once
    if (!customerId) {
      const seenCustomerIds = new Set<string>();
      const uniqueActivities: any[] = [];

      for (const act of activities) {
        if (!act.customer) continue;
        const custId = (act.customer as any)._id?.toString();
        if (!custId) continue;

        if (!seenCustomerIds.has(custId)) {
          seenCustomerIds.add(custId);
          uniqueActivities.push(act);
        }
      }

      return successResponse(uniqueActivities);
    }

    return successResponse(activities);
  } catch (error) {
    console.error('List CRM activities error:', error);
    return serverErrorResponse();
  }
}

import { z } from 'zod';

const createActivitySchema = z.object({
  customer: z.string().min(1, 'Customer ID is required'),
  type: z.string().min(1, 'Activity type is required'),
  status: z.enum(['Pending', 'Completed', 'Missed']).optional().default('Pending'),
  scheduledDate: z.coerce.date().optional(),
  remarks: z.string().trim().min(2, 'Remarks/notes are required'),
});

// POST: Create a new activity/follow-up
async function createActivityHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const data = await req.json();

    const validation = createActivitySchema.safeParse(data);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const validData = validation.data;

    // If creating a new pending activity or site visit, complete any existing pending activities for this customer
    if (validData.status === 'Pending' || validData.type === 'Site Visit') {
      await CrmActivity.updateMany(
        {
          customer: validData.customer,
          organizationId,
          status: 'Pending',
        },
        {
          status: 'Completed',
          completedDate: new Date(),
        }
      );
    }

    const activity: any = await CrmActivity.create({
      ...validData,
      type: validData.type as any,
      user: auth.userId,
      organizationId,
      completedDate: validData.status === 'Completed' ? new Date() : undefined,
    });

    if (activity && typeof activity.populate === 'function') {
      await activity.populate('user', 'firstName lastName email');
    }

    try {
      const { logAuditEvent } = await import('@/services/audit.service');
      logAuditEvent({
        organizationId,
        userId: auth.userId,
        action: 'create',
        entity: 'CRM',
        entityId: activity._id,
        entityName: `${validData.type} Follow-up`,
        description: `Logged CRM activity "${validData.type}" for customer (${validData.remarks})`,
        metadata: {
          type: validData.type,
          status: validData.status,
          customerId: validData.customer,
        },
        req,
      }).catch(() => {});
    } catch {}

    return createdResponse(activity, 'Activity created successfully');
  } catch (error: any) {
    console.error('Create CRM activity error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return errorResponse(messages.join(', '), 400);
    }

    return serverErrorResponse();
  }
}

export const GET = withAuth(getActivitiesHandler);
export const POST = withAuth(createActivityHandler);
