// =============================================================================
// InteriorOS Backend — Payments API: Delete by ID
// =============================================================================

import { NextRequest } from 'next/server';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Payment } from '@/models/payment.model';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { getOrganizationId } from '@/middlewares/auth.middleware';

// ---------------------------------------------------------------------------
// DELETE: Soft-delete a payment record
// ---------------------------------------------------------------------------
async function deletePaymentHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, paymentId } = await context.params;

    const payment = await Payment.findOneAndUpdate(
      { _id: paymentId, projectId, organizationId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!payment) {
      return notFoundResponse('Payment record not found');
    }

    return successResponse(null, 'Payment record deleted successfully');
  } catch (error) {
    console.error('Delete payment error:', error);
    return serverErrorResponse();
  }
}

export const DELETE = withProjectPermission('financials', 'delete', deletePaymentHandler);
