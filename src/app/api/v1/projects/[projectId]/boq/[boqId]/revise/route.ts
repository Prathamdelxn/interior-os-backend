// =============================================================================
// InteriorOS Backend — BOQ Revision API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { BOQ } from '@/models/boq.model';
import { BOQItem } from '@/models/boq.model';
import { createdResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// POST: Create a new revision from an approved BOQ
async function reviseBoqHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, boqId } = await context.params;

    const parentBoq = await BOQ.findOne({ _id: boqId, projectId, organizationId, isDeleted: false });
    if (!parentBoq) {
      return notFoundResponse('BOQ not found');
    }

    if (parentBoq.status !== 'approved') {
      return errorResponse('Only approved BOQs can be revised', 400);
    }

    const parentItems = await BOQItem.find({ boqId: parentBoq._id, isDeleted: false }).sort({ serialNumber: 1 });

    const lastBoq = await BOQ.findOne({ projectId, organizationId })
      .sort({ version: -1 })
      .select('version');

    const nextVersion = lastBoq ? lastBoq.version + 1 : 1;
    const parentMajor = parentBoq.versionLabel.split('.')[0];
    const parentMinor = parseInt(parentBoq.versionLabel.split('.')[1] || '0', 10);
    const versionLabel = `${parentMajor}.${parentMinor + 1}`;

    parentBoq.status = 'superseded';
    await parentBoq.save();

    const newBoq = new BOQ({
      organizationId,
      projectId,
      version: nextVersion,
      versionLabel,
      status: 'draft',
      totalAmount: parentBoq.totalAmount,
      currency: parentBoq.currency,
      notes: `Revision of ${parentBoq.versionLabel}`,
      importedFrom: parentBoq.importedFrom,
      parentVersion: parentBoq._id,
      createdBy: auth.userId,
    });

    await newBoq.save();

    const newItems = parentItems.map((item) => ({
      organizationId,
      projectId,
      boqId: newBoq._id,
      serialNumber: item.serialNumber,
      category: item.category,
      itemName: item.itemName,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount,
      consumedQuantity: item.consumedQuantity,
      remainingQuantity: item.remainingQuantity,
      variancePercentage: item.variancePercentage,
    }));

    await BOQItem.insertMany(newItems);

    const createdItems = await BOQItem.find({ boqId: newBoq._id, isDeleted: false }).sort({ serialNumber: 1 });

    return createdResponse(
      { ...newBoq.toJSON(), items: createdItems },
      `Revision ${versionLabel} created from ${parentBoq.versionLabel}`
    );
  } catch (error: any) {
    console.error('Revise BOQ error:', error);
    if (error.code === 11000) {
      return errorResponse('Version conflict. Please try again.', 409);
    }
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('boq', 'update', reviseBoqHandler);
