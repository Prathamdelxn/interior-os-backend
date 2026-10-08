// =============================================================================
// InteriorOS Backend — BOQ vs Actual Comparison API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { BOQ } from '@/models/boq.model';
import { BOQItem } from '@/models/boq.model';
import { Inventory } from '@/models/inventory.model';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Get BOQ vs Actual comparison for the latest approved/active BOQ
async function boqActualHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    // Find the latest approved BOQ (or superseded if a revision exists)
    let activeBoq = await BOQ.findOne({
      projectId,
      organizationId,
      status: 'approved',
      isDeleted: false,
    }).sort({ version: -1 });

    // If no approved, try the latest superseded (it was once approved)
    if (!activeBoq) {
      activeBoq = await BOQ.findOne({
        projectId,
        organizationId,
        status: 'superseded',
        isDeleted: false,
      }).sort({ version: -1 });
    }

    if (!activeBoq) {
      return notFoundResponse('No approved BOQ found for this project');
    }

    const boqItems = await BOQItem.find({ boqId: activeBoq._id, isDeleted: false }).sort({ serialNumber: 1 });

    // Get inventory data for this project
    const inventoryItems = await Inventory.find({
      projectId,
      organizationId,
      isDeleted: false,
    });

    // Build inventory lookup by product name (case-insensitive)
    const inventoryMap = new Map<string, { totalReceived: number; installedQuantity: number; unit: string }>();
    for (const inv of inventoryItems) {
      inventoryMap.set(inv.productName.toLowerCase(), {
        totalReceived: inv.totalReceived,
        installedQuantity: inv.installedQuantity,
        unit: inv.unit,
      });
    }

    // Build comparison data
    const comparison = boqItems.map((item) => {
      const invData = inventoryMap.get(item.itemName.toLowerCase());
      const consumedQty = invData ? invData.installedQuantity : item.consumedQuantity;
      const remaining = item.quantity - consumedQty;
      const variance = item.quantity > 0
        ? ((consumedQty - item.quantity) / item.quantity) * 100
        : 0;

      let status: 'on_track' | 'over_budget' | 'completed' | 'in_progress' | 'not_started' = 'not_started';
      if (consumedQty >= item.quantity && item.quantity > 0) {
        status = consumedQty > item.quantity ? 'over_budget' : 'completed';
      } else if (consumedQty > 0) {
        status = variance > 0 ? 'over_budget' : consumedQty >= item.quantity * 0.8 ? 'on_track' : 'in_progress';
      }

      return {
        _id: item._id,
        serialNumber: item.serialNumber,
        category: item.category,
        itemName: item.itemName,
        unit: item.unit,
        rate: item.rate,
        plannedQuantity: item.quantity,
        plannedAmount: item.amount,
        consumedQuantity: consumedQty,
        consumedAmount: consumedQty * (item.rate || 0),
        remainingQuantity: remaining,
        remainingAmount: remaining * (item.rate || 0),
        variancePercentage: Math.round(variance * 100) / 100,
        status,
      };
    });

    // Summary stats
    const totalPlanned = comparison.reduce((s, c) => s + c.plannedAmount, 0);
    const totalConsumed = comparison.reduce((s, c) => s + c.consumedAmount, 0);
    const totalRemaining = comparison.reduce((s, c) => s + c.remainingAmount, 0);
    const overBudgetItems = comparison.filter(c => c.status === 'over_budget').length;

    return successResponse({
      boqVersion: activeBoq.versionLabel,
      boqId: activeBoq._id,
      summary: {
        totalPlannedAmount: totalPlanned,
        totalConsumedAmount: totalConsumed,
        totalRemainingAmount: totalRemaining,
        overallVariance: totalPlanned > 0 ? Math.round(((totalConsumed - totalPlanned) / totalPlanned) * 10000) / 100 : 0,
        overBudgetItems,
        completedItems: comparison.filter(c => c.status === 'completed').length,
        inProgressItems: comparison.filter(c => c.status === 'in_progress').length,
      },
      items: comparison,
    });
  } catch (error) {
    console.error('BOQ vs Actual error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(boqActualHandler);
