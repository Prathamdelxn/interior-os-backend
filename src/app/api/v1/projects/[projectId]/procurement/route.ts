// =============================================================================
// InteriorOS Backend — Procurement / PO API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { PurchaseOrder } from '@/models/purchase-order.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all Purchase Orders for the project
async function getPurchaseOrdersHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const pos = await PurchaseOrder.find({ projectId, organizationId }).sort({ createdAt: -1 });
    return successResponse(pos);
  } catch (error) {
    console.error('Get POs error:', error);
    return serverErrorResponse();
  }
}

// POST: Create a new Purchase Order
async function createPurchaseOrderHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const vendorName = (body.vendorName || '').trim() || 'Unassigned';

    let poItems = body.items || [];
    let calculatedAmount = 0;
    let materialName = body.materialName;

    if (poItems.length > 0) {
      // Calculate amount from items
      calculatedAmount = poItems.reduce((acc: number, it: any) => {
        const itemAmount = (it.quantity || 0) * (it.unitPrice || 0);
        it.amount = itemAmount; // ensure amount is set per item
        return acc + itemAmount;
      }, 0);

      if (!materialName) {
        materialName = poItems[0].name;
      }
    } else {
      // Fallback to legacy single product
      if (!body.materialName || body.amount === undefined) {
        return errorResponse('Either items list or materialName and amount are required', 400);
      }
      calculatedAmount = body.amount;
      poItems = [{
        name: body.materialName,
        quantity: 1,
        unit: 'nos',
        unitPrice: body.amount,
        amount: body.amount
      }];
    }

    const currentYear = new Date().getFullYear();
    const latestPo = await PurchaseOrder.findOne({ organizationId, isDeleted: { $in: [true, false] } })
      .sort({ createdAt: -1 })
      .select('poNumber')
      .lean();
    let nextNum = 1;
    if (latestPo?.poNumber) {
      const match = latestPo.poNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    let poNumber = `PO-${currentYear}-${String(nextNum).padStart(3, '0')}`;
    let exists = await PurchaseOrder.findOne({ organizationId, poNumber, isDeleted: { $in: [true, false] } });
    while (exists) {
      nextNum++;
      poNumber = `PO-${currentYear}-${String(nextNum).padStart(3, '0')}`;
      exists = await PurchaseOrder.findOne({ organizationId, poNumber, isDeleted: { $in: [true, false] } });
    }

    const po = new PurchaseOrder({
      poNumber,
      vendorName,
      materialName,
      amount: calculatedAmount,
      currency: body.currency || 'INR',
      status: body.status || 'pending',
      deliveryDate: body.deliveryDate,
      items: poItems,
      projectId,
      organizationId,
    });

    await po.save();
    return createdResponse(po, 'Purchase Order created successfully');
  } catch (error) {
    console.error('Create PO error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getPurchaseOrdersHandler);
export const POST = withAuth(createPurchaseOrderHandler);
