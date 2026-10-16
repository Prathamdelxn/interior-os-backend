// =============================================================================
// InteriorOS Backend — Inventory Item Details API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Inventory } from '@/models/inventory.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const updateMaterialSchema = z.object({
  productName: z.string().optional(),
  unit: z.string().optional(),
});

// PUT: Update an inventory material (e.g. name, unit)
async function updateInventoryHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, inventoryId } = await context.params;
    const body = await req.json();

    const validation = updateMaterialSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const item = await Inventory.findOne({ _id: inventoryId, projectId, organizationId, isDeleted: false });
    if (!item) {
      return notFoundResponse('Inventory material not found');
    }

    if (validation.data.productName) item.productName = validation.data.productName;
    if (validation.data.unit) item.unit = validation.data.unit;

    await item.save();

    return successResponse(item, 'Material updated successfully');
  } catch (error) {
    console.error('Update inventory error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft delete an inventory material
async function deleteInventoryHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, inventoryId } = await context.params;

    const item = await Inventory.findOne({ _id: inventoryId, projectId, organizationId, isDeleted: false });
    if (!item) {
      return notFoundResponse('Inventory material not found');
    }

    item.isDeleted = true;
    await item.save();

    return successResponse(null, 'Material deleted successfully');
  } catch (error) {
    console.error('Delete inventory error:', error);
    return serverErrorResponse();
  }
}

export const PUT = withProjectPermission('inventory', 'update', updateInventoryHandler);
export const DELETE = withProjectPermission('inventory', 'delete', deleteInventoryHandler);
