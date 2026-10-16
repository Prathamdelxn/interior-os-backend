// =============================================================================
// InteriorOS Backend — Variation Order Approval & Auto-Impact API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { VariationOrder, Project, BOQ, BOQItem, Package, Task, PurchaseOrder, User } from '@/models';
import { Building, Floor, Zone, Area } from '@/models/wbs.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

// POST: Approve Variation Order and execute database side-effects
async function approveVoHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, voId } = await context.params;

    const existing = await VariationOrder.findOne({ _id: voId, projectId, organizationId, isDeleted: false });
    if (!existing) {
      return notFoundResponse('Variation order not found');
    }
    if (existing.status === 'approved' || existing.status === 'executed') {
      return errorResponse('Variation order is already approved/executed', 400);
    }

    const project = await Project.findOne({ _id: projectId, organizationId, isDeleted: false });
    if (!project) {
      return notFoundResponse('Project not found');
    }

    // Approve first, atomically, so the updates below can never run twice
    // (a retry after a failure used to add the budget difference again).
    const variationOrder = await VariationOrder.findOneAndUpdate(
      { _id: voId, projectId, organizationId, isDeleted: false, status: { $nin: ['approved', 'executed'] } },
      { $set: { status: 'approved', billingGenerated: true, billingGeneratedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!variationOrder) {
      return errorResponse('Variation order is already approved/executed', 400);
    }

    const netDifference = Number(variationOrder.financialSummary?.netDifference) || 0;
    const timelineImpactDays = Number(variationOrder.impactAnalysis?.timelineImpactDays) || 3;
    const materialCost = Number(variationOrder.impactAnalysis?.materialCost) || 0;
    const warnings: string[] = [];
    const result = { budgetUpdated: false, boqUpdated: false, taskCreated: false, poCreated: false };

    // 1. PROJECT BUDGET
    try {
      await Project.updateOne(
        { _id: projectId, organizationId },
        project.budget ? { $inc: { 'budget.amount': netDifference } } : { $set: { budget: { amount: netDifference, currency: 'INR' } } }
      );
      result.budgetUpdated = true;
    } catch (err) {
      console.error('VO approve: budget update failed', err);
      warnings.push('project budget');
    }

    // 2. BOQ — additions become a line item; reductions lower the BOQ total
    try {
      const activeBoq = await BOQ.findOne({ projectId, organizationId, status: 'approved', isDeleted: false });
      if (activeBoq && netDifference !== 0) {
        if (netDifference > 0) {
          const latestItem = await BOQItem.findOne({ boqId: activeBoq._id }).sort({ serialNumber: -1 });
          await BOQItem.create({
            organizationId,
            projectId,
            boqId: activeBoq._id,
            serialNumber: latestItem ? latestItem.serialNumber + 1 : 1,
            category: variationOrder.category || 'Variation',
            itemName: `VO Item - ${variationOrder.voNumber}`,
            description: `Variation Addition: ${variationOrder.description || ''}`,
            quantity: 1,
            unit: 'LS', // Lump Sum
            rate: netDifference,
            amount: netDifference,
            consumedQuantity: 0,
            remainingQuantity: 1,
            variancePercentage: 0,
          });
        }
        activeBoq.totalAmount = Math.max(0, (activeBoq.totalAmount || 0) + netDifference);
        await activeBoq.save();
        result.boqUpdated = true;
      }
    } catch (err) {
      console.error('VO approve: BOQ update failed', err);
      warnings.push('BOQ');
    }

    // 3. EXECUTION TASK — linked to an existing WBS node (a package can't be created without an area)
    try {
      const wbsNode =
        (await Package.findOne({ projectId, organizationId }).select('_id')) ||
        (await Area.findOne({ projectId, organizationId }).select('_id')) ||
        (await Zone.findOne({ projectId, organizationId }).select('_id')) ||
        (await Floor.findOne({ projectId, organizationId }).select('_id')) ||
        (await Building.findOne({ projectId, organizationId }).select('_id'));
      if (wbsNode) {
        await Task.create({
          organizationId,
          projectId,
          packageId: wbsNode._id,
          name: `Execute VO: ${variationOrder.voNumber}`,
          description: `Scope adjustment task for Variation Order: ${variationOrder.description || ''}`,
          status: 'todo',
          priority: 'high',
          startDate: new Date(),
          endDate: new Date(Date.now() + timelineImpactDays * 24 * 60 * 60 * 1000),
          assignees: [],
          progress: 0,
          dependencies: [],
        });
        result.taskCreated = true;
      } else {
        warnings.push('execution task (add a WBS item to the project first)');
      }
    } catch (err) {
      console.error('VO approve: task creation failed', err);
      warnings.push('execution task');
    }

    // 4. PROCUREMENT PLAN (PURCHASE ORDER)
    if (materialCost > 0) {
      try {
        await PurchaseOrder.create({
          organizationId,
          projectId,
          poNumber: `PO-VO-${variationOrder.voNumber}`,
          vendorName: 'Select Vendor',
          materialName: `Variation Material - ${variationOrder.voNumber}`,
          amount: materialCost,
          currency: 'INR',
          status: 'pending',
          deliveryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          items: [
            {
              name: `Materials for ${variationOrder.voNumber}`,
              quantity: 1,
              unit: 'LS',
              unitPrice: materialCost,
              amount: materialCost,
            },
          ],
        });
        result.poCreated = true;
      } catch (err) {
        console.error('VO approve: PO creation failed', err);
        warnings.push('purchase order');
      }
    }

    return successResponse(
      { variationOrder, ...result, warnings },
      warnings.length
        ? `Variation order approved. Could not update: ${warnings.join(', ')}`
        : 'Variation order approved and project data updated successfully'
    );
  } catch (error) {
    console.error('Approve variation order error:', error);
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('variation_orders', 'approve', approveVoHandler);
