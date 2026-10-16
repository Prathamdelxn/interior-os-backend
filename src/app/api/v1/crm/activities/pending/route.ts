// =============================================================================
// InteriorOS Backend — CRM Pending Follow-ups API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withAnyPermission } from '@/middlewares/auth.middleware';
import { CRM_MODULES } from '@/lib/crm-access';
import { connectDB } from '@/lib/db';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: List pending follow-up activities
async function getPendingActivitiesHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const typeParam = req.nextUrl.searchParams.get('type');

    const query: any = {
      organizationId,
      status: 'Pending',
    };

    if (typeParam) {
      query.type = typeParam;
    } else {
      // By default, follow-ups are client communication touchpoints
      query.type = { $nin: ['Site Visit', 'Status Change', 'System Update'] };
    }

    const pendingActivities = await CrmActivity.find(query)
      .populate({
        path: 'customer',
        select: 'name mobileNumber status assignedSalesExecutive leadNumber projectLocation',
        populate: { path: 'assignedSalesExecutive', select: 'firstName lastName email' },
      })
      .populate('user', 'firstName lastName email')
      .sort({ scheduledDate: 1, createdAt: -1 });

    // Deduplicate: Keep only 1 pending activity per customer (latest scheduled/created)
    const seenCustomerIds = new Set<string>();
    const uniqueActivities: any[] = [];

    for (const act of pendingActivities) {
      if (!act.customer) continue;
      const cust = act.customer as any;
      const custId = cust._id?.toString();
      if (!custId) continue;

      // Exclude leads that are already lost or converted
      if (cust.status === 'Lost' || cust.status === 'Converted') continue;

      if (!seenCustomerIds.has(custId)) {
        seenCustomerIds.add(custId);
        uniqueActivities.push(act);
      }
    }

    return successResponse(uniqueActivities);
  } catch (error) {
    console.error('Pending CRM follow-ups error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAnyPermission(CRM_MODULES, 'read', getPendingActivitiesHandler);
