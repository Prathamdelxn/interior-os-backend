// =============================================================================
// InteriorOS Backend — Inventory API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission, withAnyProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Inventory } from '@/models/inventory.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const logInstallSchema = z.object({
  action: z.enum(['log_install', 'create_material']).optional(),
  inventoryId: z.string().optional(),
  quantity: z.number().min(1, 'Quantity must be at least 1').optional(),
  notes: z.string().optional(),
  // For creating material
  productName: z.string().optional(),
  unit: z.string().optional(),
  initialStock: z.number().min(0).optional(),
});

// GET: Retrieve inventory list for a project
async function getInventoryHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const inventoryItems = await Inventory.find({ projectId, organizationId, isDeleted: false })
      .sort({ productName: 1 });

    return successResponse(inventoryItems);
  } catch (error) {
    console.error('Get inventory error:', error);
    return serverErrorResponse();
  }
}

// POST: Log a material installation OR Create a new material
async function logInstallationHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = logInstallSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { action, inventoryId, quantity, notes, productName, unit, initialStock } = validation.data;

    // Create a new material catalog entry
    if (action === 'create_material') {
      if (!productName || !unit) {
        return errorResponse('Product name and unit are required', 400);
      }

      // Check if material already exists
      const existing = await Inventory.findOne({ projectId, organizationId, productName, isDeleted: false });
      if (existing) {
        return errorResponse('Material with this name already exists in inventory', 400);
      }

      const newMaterial = new Inventory({
        projectId,
        organizationId,
        productName,
        unit,
        totalReceived: initialStock || 0,
        installedQuantity: 0,
        installHistory: [],
      });

      await newMaterial.save();
      return successResponse(newMaterial, 'Material created successfully');
    }

    // Default behavior: Log installation
    if (!inventoryId || !quantity) {
      return errorResponse('inventoryId and quantity are required for logging installation', 400);
    }

    const item = await Inventory.findOne({ _id: inventoryId, projectId, organizationId, isDeleted: false });
    if (!item) {
      return notFoundResponse('Inventory item not found');
    }

    // Business validation: cannot install more than received
    const currentAvailable = item.totalReceived - item.installedQuantity;
    if (quantity > currentAvailable) {
      return errorResponse(`Insufficient inventory stock. Only ${currentAvailable} ${item.unit} available for installation.`, 400);
    }

    // Log the installation
    item.installedQuantity += quantity;
    item.installHistory.push({
      quantity,
      notes,
      date: new Date(),
    });

    await item.save();

    return successResponse(item, 'Material installation logged successfully');
  } catch (error) {
    console.error('Inventory POST error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAnyProjectPermission(['inventory', 'tasks'], 'read', getInventoryHandler);
export const POST = withProjectPermission('inventory', 'create', logInstallationHandler);
