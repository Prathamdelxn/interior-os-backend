// =============================================================================
// InteriorOS Backend — BOQ Version Comparison API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { BOQ } from '@/models/boq.model';
import { BOQItem } from '@/models/boq.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Compare two BOQ versions item-by-item
async function compareBoqHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, boqId } = await context.params;
    const otherBoqId = req.nextUrl.searchParams.get('with');

    if (!otherBoqId) {
      return errorResponse('Query param "with" (other BOQ ID) is required', 400);
    }

    const [boqA, boqB] = await Promise.all([
      BOQ.findOne({ _id: boqId, projectId, organizationId, isDeleted: false }),
      BOQ.findOne({ _id: otherBoqId, projectId, organizationId, isDeleted: false }),
    ]);

    if (!boqA) return notFoundResponse('Source BOQ not found');
    if (!boqB) return notFoundResponse('Comparison BOQ not found');

    const [itemsA, itemsB] = await Promise.all([
      BOQItem.find({ boqId: boqA._id, isDeleted: false }).sort({ serialNumber: 1 }),
      BOQItem.find({ boqId: boqB._id, isDeleted: false }).sort({ serialNumber: 1 }),
    ]);

    // Build lookup maps by itemName + category (unique identifier)
    const mapA = new Map(itemsA.map(i => [`${i.category}::${i.itemName}`, i]));
    const mapB = new Map(itemsB.map(i => [`${i.category}::${i.itemName}`, i]));

    const added: any[] = [];
    const removed: any[] = [];
    const modified: any[] = [];
    const unchanged: any[] = [];

    // Find modified and removed items (items in A)
    for (const [key, itemA] of mapA) {
      const itemB = mapB.get(key);
      if (!itemB) {
        removed.push(itemA.toJSON());
      } else {
        const qtyChanged = itemA.quantity !== itemB.quantity;
        const rateChanged = itemA.rate !== itemB.rate;
        const unitChanged = itemA.unit !== itemB.unit;

        if (qtyChanged || rateChanged || unitChanged) {
          modified.push({
            itemName: itemA.itemName,
            category: itemA.category,
            old: { quantity: itemA.quantity, unit: itemA.unit, rate: itemA.rate, amount: itemA.amount },
            new: { quantity: itemB.quantity, unit: itemB.unit, rate: itemB.rate, amount: itemB.amount },
            qtyDelta: itemB.quantity - itemA.quantity,
            rateDelta: (itemB.rate || 0) - (itemA.rate || 0),
            amountDelta: itemB.amount - itemA.amount,
          });
        } else {
          unchanged.push(itemA.toJSON());
        }
      }
    }

    // Find added items (items only in B)
    for (const [key, itemB] of mapB) {
      if (!mapA.has(key)) {
        added.push(itemB.toJSON());
      }
    }

    const summary = {
      sourceVersion: boqA.versionLabel,
      compareVersion: boqB.versionLabel,
      sourceTotalAmount: boqA.totalAmount,
      compareTotalAmount: boqB.totalAmount,
      amountDifference: boqB.totalAmount - boqA.totalAmount,
      totalAdded: added.length,
      totalRemoved: removed.length,
      totalModified: modified.length,
      totalUnchanged: unchanged.length,
    };

    return successResponse({ summary, added, removed, modified, unchanged });
  } catch (error) {
    console.error('Compare BOQ error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(compareBoqHandler);
