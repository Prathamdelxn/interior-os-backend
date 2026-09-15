// =============================================================================
// InteriorOS Backend — Purchase Order details, update, and delete Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { PurchaseOrder } from '@/models/purchase-order.model';
import { Inventory } from '@/models/inventory.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const updatePoSchema = z.object({
  status: z.enum(['requested', 'pending', 'approved', 'ordered', 'dispatched', 'partially_delivered', 'delivered', 'rejected']).optional(),
  vendorName: z.string().optional(),
  deliveryDate: z.union([z.string(), z.date()]).transform((val) => new Date(val)).optional(),
  items: z.array(z.any()).optional(),
  amount: z.number().optional(),
  grns: z.array(z.any()).optional(),
  grnData: z.any().optional(),
}).passthrough();

// GET: Retrieve a single PO
async function getPurchaseOrderDetailsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, purchaseOrderId } = await context.params;

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, projectId, organizationId, isDeleted: false });
    if (!po) {
      return notFoundResponse('Purchase Order not found');
    }
    return successResponse(po);
  } catch (error) {
    console.error('Get PO details error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update PO details / status
async function updatePurchaseOrderHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, purchaseOrderId } = await context.params;
    const body = await req.json();

    const validation = updatePoSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const oldPo = await PurchaseOrder.findOne({ _id: purchaseOrderId, projectId, organizationId, isDeleted: false });
    if (!oldPo) {
      return notFoundResponse('Purchase Order not found');
    }

    const isOldApproved = ['approved', 'dispatched', 'partially_delivered', 'delivered'].includes(oldPo.status);
    if (isOldApproved) {
      // Disallow changing vendorName or modifying rates/items once approved
      if (body.vendorName && body.vendorName !== oldPo.vendorName) {
        return errorResponse('Vendor cannot be changed once the Purchase Order is approved', 400);
      }
      if (body.items !== undefined && JSON.stringify(body.items) !== JSON.stringify(oldPo.items)) {
        return errorResponse('Rates and items cannot be modified once the Purchase Order is approved', 400);
      }
    }

    const newStatus = body.status;
    const wasDelivered = oldPo.status === 'delivered';
    const isNowDelivered = newStatus === 'delivered';

    // Perform updates
    const updatedPo = await PurchaseOrder.findOneAndUpdate(
      { _id: purchaseOrderId, projectId, organizationId, isDeleted: false },
      { $set: body },
      { returnDocument: 'after' }
    );

    // Sync items with inventory if the status changed into/out of 'delivered'
    if (newStatus && oldPo.status !== newStatus && updatedPo) {
      const itemsToSync = (updatedPo.items && updatedPo.items.length > 0)
        ? updatedPo.items
        : [{ name: updatedPo.materialName, quantity: 1, unit: 'nos' }];

      if (isNowDelivered && !wasDelivered) {
        // Increment inventory
        for (const item of itemsToSync) {
          await Inventory.findOneAndUpdate(
            { projectId, organizationId, productName: item.name },
            {
              $inc: { totalReceived: item.quantity },
              $setOnInsert: { installedQuantity: 0, unit: item.unit }
            },
            { upsert: true }
          );
        }
      } else if (!isNowDelivered && wasDelivered) {
        // Decrement inventory
        for (const item of itemsToSync) {
          await Inventory.findOneAndUpdate(
            { projectId, organizationId, productName: item.name },
            { $inc: { totalReceived: -item.quantity } }
          );
        }
      }
    }

    return successResponse(updatedPo, 'Purchase Order updated successfully');
  } catch (error) {
    console.error('Update PO error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft delete PO
async function deletePurchaseOrderHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, purchaseOrderId } = await context.params;

    const po = await PurchaseOrder.findOneAndUpdate(
      { _id: purchaseOrderId, projectId, organizationId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!po) {
      return notFoundResponse('Purchase Order not found');
    }

    // Reconcile if the deleted PO was already delivered
    if (po.status === 'delivered') {
      const itemsToSync = (po.items && po.items.length > 0)
        ? po.items
        : [{ name: po.materialName, quantity: 1, unit: 'nos' }];

      for (const item of itemsToSync) {
        await Inventory.findOneAndUpdate(
          { projectId, organizationId, productName: item.name },
          { $inc: { totalReceived: -item.quantity } }
        );
      }
    }

    return successResponse(null, 'Purchase Order deleted successfully');
  } catch (error) {
    console.error('Delete PO error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getPurchaseOrderDetailsHandler);
export const PUT = withAuth(updatePurchaseOrderHandler);
export const DELETE = withAuth(deletePurchaseOrderHandler);
