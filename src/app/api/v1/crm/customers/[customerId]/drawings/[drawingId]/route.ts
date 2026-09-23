// =============================================================================
// InteriorOS Backend — CRM Delete Drawing API
// Deletes a 2D or 3D drawing from a customer lead
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

async function deleteDrawingHandler(
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { customerId, drawingId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return errorResponse('Invalid customer ID', 400);
    }

    let customer = await CrmCustomer.findOne({ _id: customerId, organizationId });
    if (!customer) {
      customer = await CrmCustomer.findById(customerId);
    }
    if (!customer) {
      return errorResponse('Customer/Lead not found', 404);
    }

    const drawingList = customer.designFiles || (customer as any).designs || [];
    const drawingIndex = drawingList.findIndex(
      (d: any, idx: number) =>
        d._id?.toString() === drawingId ||
        d.id?.toString() === drawingId ||
        String(d._id) === String(drawingId) ||
        String(d.id) === String(drawingId) ||
        d.name === drawingId ||
        d.title === drawingId ||
        d.url === drawingId ||
        String(idx) === String(drawingId)
    );

    if (drawingIndex === -1) {
      return errorResponse('Drawing file not found', 404);
    }

    const removedDrawing = drawingList[drawingIndex];
    drawingList.splice(drawingIndex, 1);
    customer.designFiles = drawingList;

    await customer.save();

    // Log Activity
    const userId = new mongoose.Types.ObjectId(auth.userId);
    await CrmActivity.create({
      organizationId: customer.organizationId || organizationId,
      customer: customer._id,
      user: userId,
      type: '2D/3D Drawing',
      status: 'Completed',
      remarks: `Deleted drawing "${removedDrawing.title || removedDrawing.name || 'Drawing'}"`,
      completedDate: new Date(),
    }).catch(() => null);

    return successResponse({
      customer,
      message: `Drawing "${removedDrawing.title || removedDrawing.name || 'Drawing'}" deleted successfully.`,
    });
  } catch (error) {
    console.error('Error deleting drawing:', error);
    return serverErrorResponse('Failed to delete drawing');
  }
}

export const DELETE = withAuth(deleteDrawingHandler);
