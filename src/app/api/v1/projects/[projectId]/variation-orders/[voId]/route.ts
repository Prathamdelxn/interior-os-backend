// =============================================================================
// InteriorOS Backend — Single Variation Order API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { VariationOrder, User } from '@/models';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve a single Variation Order
async function getVoHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, voId } = await context.params;

    const variationOrder = await VariationOrder.findOne({
      _id: voId,
      projectId,
      organizationId,
      isDeleted: false,
    }).populate('requestedBy', 'firstName lastName email');

    if (!variationOrder) {
      return notFoundResponse('Variation order not found');
    }

    return successResponse(variationOrder);
  } catch (error) {
    console.error('Get variation order error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update Variation Order details
async function updateVoHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, voId } = await context.params;
    const body = await req.json();

    const variationOrder = await VariationOrder.findOne({
      _id: voId,
      projectId,
      organizationId,
      isDeleted: false,
    });

    if (!variationOrder) {
      return notFoundResponse('Variation order not found');
    }

    const fieldsToUpdate = ['type', 'category', 'status', 'description'];
    for (const field of fieldsToUpdate) {
      if (body[field] !== undefined) {
        (variationOrder as any)[field] = body[field];
      }
    }

    if (body.impactAnalysis) {
      variationOrder.impactAnalysis = {
        ...variationOrder.impactAnalysis,
        ...body.impactAnalysis,
      };
    }

    if (body.financialSummary) {
      variationOrder.financialSummary = {
        ...variationOrder.financialSummary,
        ...body.financialSummary,
      };
    }

    if (body.attachments) {
      variationOrder.attachments = body.attachments;
    }

    await variationOrder.save();

    const populatedVo = await VariationOrder.findById(variationOrder._id).populate('requestedBy', 'firstName lastName email');
    return successResponse(populatedVo, 'Variation order updated successfully');
  } catch (error) {
    console.error('Update variation order error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('variation_orders', 'read', getVoHandler);
export const PUT = withProjectPermission('variation_orders', 'update', updateVoHandler);
