// =============================================================================
// InteriorOS Backend — BOQ API: Get, Update, Delete Single BOQ
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { BOQ } from '@/models/boq.model';
import { BOQItem } from '@/models/boq.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const updateBoqItemSchema = z.object({
  _id: z.string().optional(),
  serialNumber: z.number().optional(),
  itemCode: z.string().optional(),
  category: z.string().min(1),
  sectionNumber: z.string().optional(),
  sectionTitle: z.string().optional(),
  sectionScope: z.string().optional(),
  itemName: z.string().min(1),
  description: z.string().optional(),
  brandMakes: z.string().optional(),
  quantity: z.number().min(0),
  unit: z.string().min(1),
  rate: z.number().min(0).optional(),
  amount: z.number().optional(),
  remarks: z.string().optional(),
});

const updateBoqSchema = z.object({
  notes: z.string().optional(),
  sections: z.array(z.any()).optional(),
  items: z.array(updateBoqItemSchema).optional(),
});

// GET: Get a specific BOQ with all its items
async function getBoqHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, boqId } = await context.params;

    const boq = await BOQ.findOne({ _id: boqId, projectId, organizationId, isDeleted: false })
      .populate('createdBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('submittedBy', 'firstName lastName email')
      .populate('rejectedBy', 'firstName lastName email');

    if (!boq) {
      return notFoundResponse('BOQ not found');
    }

    const items = await BOQItem.find({ boqId: boq._id, isDeleted: false }).sort({ serialNumber: 1 });

    return successResponse({ ...boq.toJSON(), items });
  } catch (error) {
    console.error('Get BOQ error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update BOQ (only if draft)
async function updateBoqHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, boqId } = await context.params;
    const body = await req.json();

    const validation = updateBoqSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const boq = await BOQ.findOne({ _id: boqId, projectId, organizationId, isDeleted: false });
    if (!boq) {
      return notFoundResponse('BOQ not found');
    }

    if (boq.status !== 'draft' && boq.status !== 'rejected') {
      return errorResponse('Only draft or rejected BOQs can be edited', 400);
    }

    const { notes, sections, items } = validation.data;

    if (notes !== undefined) {
      boq.notes = notes;
    }

    if (sections !== undefined) {
      boq.sections = sections;
    }

    if (items && items.length > 0) {
      // Delete existing items and recreate
      await BOQItem.updateMany(
        { boqId: boq._id, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      );

      const newItems = items.map((item, idx) => ({
        organizationId,
        projectId,
        boqId: boq._id,
        serialNumber: item.serialNumber || idx + 1,
        itemCode: item.itemCode || String(item.serialNumber || idx + 1),
        category: item.category,
        sectionNumber: item.sectionNumber || '',
        sectionTitle: item.sectionTitle || item.category || '',
        sectionScope: item.sectionScope || '',
        itemName: item.itemName,
        description: item.description || '',
        brandMakes: item.brandMakes || '',
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate || 0,
        amount: item.amount !== undefined ? item.amount : item.quantity * (item.rate || 0),
        remarks: item.remarks || '',
        consumedQuantity: 0,
        remainingQuantity: item.quantity,
        variancePercentage: 0,
      }));

      await BOQItem.insertMany(newItems);

      // Recalculate total
      boq.totalAmount = newItems.reduce((sum, item) => sum + item.amount, 0);
    }

    // If it was rejected, reset back to draft on edit
    if (boq.status === 'rejected') {
      boq.status = 'draft';
      boq.rejectedBy = undefined;
      boq.rejectedAt = undefined;
      boq.rejectionReason = undefined;
    }

    await boq.save();

    const updatedItems = await BOQItem.find({ boqId: boq._id, isDeleted: false }).sort({ serialNumber: 1 });

    return successResponse({ ...boq.toJSON(), items: updatedItems }, 'BOQ updated successfully');
  } catch (error) {
    console.error('Update BOQ error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft-delete a BOQ
async function deleteBoqHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, boqId } = await context.params;

    const boq = await BOQ.findOne({ _id: boqId, projectId, organizationId, isDeleted: false });
    if (!boq) {
      return notFoundResponse('BOQ not found');
    }

    if (boq.status === 'approved') {
      return errorResponse('Approved BOQs cannot be deleted. Create a revision instead.', 400);
    }

    boq.isDeleted = true;
    boq.deletedAt = new Date();
    await boq.save();

    // Soft-delete all items
    await BOQItem.updateMany(
      { boqId: boq._id },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );

    return successResponse(null, 'BOQ deleted successfully');
  } catch (error) {
    console.error('Delete BOQ error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getBoqHandler);
export const PUT = withAuth(updateBoqHandler);
export const DELETE = withAuth(deleteBoqHandler);
