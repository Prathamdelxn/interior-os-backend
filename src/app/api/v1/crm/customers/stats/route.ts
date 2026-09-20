// =============================================================================
// InteriorOS Backend — CRM Customer Pipeline Stats Aggregation API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { successResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

async function getCustomerStatsHandler(
  _req: NextRequest,
  _context: any,
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const orgObjectId = new mongoose.Types.ObjectId(organizationId);

    const [stats] = await CrmCustomer.aggregate([
      { $match: { organizationId: orgObjectId } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          lost: [{ $match: { status: 'Lost' } }, { $count: 'count' }],
          won: [{ $match: { status: { $in: ['Won', 'Converted'] } } }, { $count: 'count' }],
          followUps: [
            { $match: { status: { $in: ['New Lead', 'Contacted', 'Meeting Scheduled'] } } },
            { $count: 'count' },
          ],
          siteVisits: [
            {
              $match: {
                $or: [
                  { status: { $in: ['Under Site Visit', 'Measurement Done', 'Meeting Scheduled'] } },
                  { 'siteMeasurements.carpetArea': { $exists: true, $ne: '' } },
                ],
              },
            },
            { $count: 'count' },
          ],
          requirementDesign: [
            {
              $match: {
                $or: [
                  { status: { $in: ['Under Requirement', 'Requirement Completed'] } },
                  { 'requirements.0': { $exists: true } },
                ],
              },
            },
            { $count: 'count' },
          ],
          drawing: [
            {
              $match: {
                $or: [
                  { status: { $in: ['Under Drawing', 'Design Approved'] } },
                  { 'designFiles.0': { $exists: true } },
                ],
              },
            },
            { $count: 'count' },
          ],
          boq: [
            {
              $match: {
                $or: [
                  { status: 'Under BOQ Creation' },
                  { 'boqs.0': { $exists: true } },
                ],
              },
            },
            { $count: 'count' },
          ],
          quotations: [
            {
              $match: {
                $or: [
                  {
                    status: {
                      $in: [
                        'Under Quotation',
                        'Quotation Pending',
                        'Quotation Sent',
                        'Negotiation',
                        'Booking Pending',
                        'Won',
                        'Converted',
                      ],
                    },
                  },
                  { 'quotations.0': { $exists: true } },
                ],
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]);

    const totalCount = stats?.total?.[0]?.count || 0;
    const lostCount = stats?.lost?.[0]?.count || 0;
    const stageCounts = {
      leads: Math.max(0, totalCount - lostCount),
      follow_ups: stats?.followUps?.[0]?.count || 0,
      site_visits: stats?.siteVisits?.[0]?.count || 0,
      requirement_design: stats?.requirementDesign?.[0]?.count || 0,
      drawing: stats?.drawing?.[0]?.count || 0,
      boq: stats?.boq?.[0]?.count || 0,
      quotations: stats?.quotations?.[0]?.count || 0,
      won_projects: stats?.won?.[0]?.count || 0,
      lost_leads: lostCount,
    };

    return successResponse(stageCounts, 'Stage statistics calculated successfully');
  } catch (error) {
    console.error('Get CRM stage statistics error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getCustomerStatsHandler);
