// =============================================================================
// InteriorOS Backend — BOQ Items API: Add & Batch Update
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { BOQ } from '@/models/boq.model';
import { BOQItem } from '@/models/boq.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const addItemSchema = z.object({
  items: z.array(
    z.object({
      serialNumber: z.number().min(1),
      category: z.string().min(1),
      itemName: z.string().min(1),
      description: z.string().optional(),
      quantity: z.number().min(0),
      unit: z.string().min(1),
      rate: z.number().min(0),
    })
  ).min(1, 'At least one item is required'),
});

// POST: Add items to an existing BOQ
async function addItemsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, boqId } = await context.params;
    const body = await req.json();

    const validation = addItemSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const boq = await BOQ.findOne({ _id: boqId, projectId, organizationId, isDeleted: false });
    if (!boq) {
      return notFoundResponse('BOQ not found');
    }

    if (boq.status !== 'draft' && boq.status !== 'rejected') {
      return errorResponse('Items can only be added to draft or rejected BOQs', 400);
    }

    const { items } = validation.data;

    // Get current max serial number
    const lastItem = await BOQItem.findOne({ boqId: boq._id, isDeleted: false })
      .sort({ serialNumber: -1 })
      .select('serialNumber');

    let nextSerial = lastItem ? lastItem.serialNumber + 1 : 1;

    const newItems = items.map((item) => ({
      organizationId,
      projectId,
      boqId: boq._id,
      serialNumber: item.serialNumber || nextSerial++,
      category: item.category,
      itemName: item.itemName,
      description: item.description || '',
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
      amount: item.quantity * item.rate,
      consumedQuantity: 0,
      remainingQuantity: item.quantity,
      variancePercentage: 0,
    }));

    await BOQItem.insertMany(newItems);

    // Recalculate total
    const allItems = await BOQItem.find({ boqId: boq._id, isDeleted: false });
    boq.totalAmount = allItems.reduce((sum, item) => sum + item.amount, 0);
    await boq.save();

    return successResponse(
      { ...boq.toJSON(), items: allItems.sort((a, b) => a.serialNumber - b.serialNumber) },
      'Items added successfully'
    );
  } catch (error) {
    console.error('Add BOQ items error:', error);
    return serverErrorResponse();
  }
}

// PUT: Batch update individual items
async function updateItemsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, boqId } = await context.params;
    const body = await req.json();

    const boq = await BOQ.findOne({ _id: boqId, projectId, organizationId, isDeleted: false });
    if (!boq) {
      return notFoundResponse('BOQ not found');
    }

    if (boq.status !== 'draft' && boq.status !== 'rejected') {
      return errorResponse('Items can only be updated in draft or rejected BOQs', 400);
    }

    const { updates } = body as { updates: Array<{ itemId: string; quantity?: number; rate?: number; category?: string; itemName?: string; description?: string; unit?: string }> };

    if (!updates || updates.length === 0) {
      return errorResponse('No updates provided', 400);
    }

    for (const update of updates) {
      const item = await BOQItem.findOne({ _id: update.itemId, boqId: boq._id, isDeleted: false });
      if (!item) continue;

      if (update.quantity !== undefined) item.quantity = update.quantity;
      if (update.rate !== undefined) item.rate = update.rate;
      if (update.category) item.category = update.category;
      if (update.itemName) item.itemName = update.itemName;
      if (update.description !== undefined) item.description = update.description;
      if (update.unit) item.unit = update.unit;

      item.amount = item.quantity * (item.rate || 0);
      item.remainingQuantity = item.quantity - item.consumedQuantity;
      item.variancePercentage = item.quantity > 0
        ? ((item.consumedQuantity - item.quantity) / item.quantity) * 100
        : 0;

      await item.save();
    }

    // Recalculate total
    const allItems = await BOQItem.find({ boqId: boq._id, isDeleted: false });
    boq.totalAmount = allItems.reduce((sum, item) => sum + item.amount, 0);
    await boq.save();

    return successResponse(
      { ...boq.toJSON(), items: allItems.sort((a, b) => a.serialNumber - b.serialNumber) },
      'Items updated successfully'
    );
  } catch (error) {
    console.error('Update BOQ items error:', error);
    return serverErrorResponse();
  }
}

export const POST = withAuth(addItemsHandler);
export const PUT = withAuth(updateItemsHandler);
