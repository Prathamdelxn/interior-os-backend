// =============================================================================
// InteriorOS Backend — Variation Orders Dashboard Metrics API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { VariationOrder, User } from '@/models';
import { successResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Aggregate metrics for variation orders dashboard
async function getDashboardMetricsHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const allVOs = await VariationOrder.find({
      projectId,
      organizationId,
      isDeleted: false,
    });

    const totalVariationOrders = allVOs.length;
    const approvedVOs = allVOs.filter(vo => vo.status === 'approved' || vo.status === 'executed');
    const approvedVariations = approvedVOs.length;
    
    const pendingVariations = allVOs.filter(vo => 
      ['submitted', 'pm_review', 'commercial_review', 'management_approval', 'client_approval'].includes(vo.status)
    ).length;

    const additionalRevenueGenerated = approvedVOs.reduce((sum, vo) => sum + (vo.financialSummary?.netDifference || 0), 0);
    const timelineImpact = approvedVOs.reduce((sum, vo) => sum + (vo.impactAnalysis?.timelineImpactDays || 0), 0);

    return successResponse({
      totalVariationOrders,
      approvedVariations,
      pendingVariations,
      additionalRevenueGenerated,
      timelineImpact,
    });
  } catch (error) {
    console.error('Get variation order dashboard metrics error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('variation_orders', 'read', getDashboardMetricsHandler);
