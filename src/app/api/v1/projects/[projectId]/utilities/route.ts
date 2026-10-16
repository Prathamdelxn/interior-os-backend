// =============================================================================
// InteriorOS Backend — Utilities API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { UtilitySystem } from '@/models/utility.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all utility systems for the project
async function getUtilitiesHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    let systems = await UtilitySystem.find({ projectId, organizationId });
    
    // Auto-initialize default system rows if empty
    if (systems.length === 0) {
      const defaultSystems = ['electrical', 'hvac', 'phe', 'fire_fighting', 'stp', 'elv'];
      systems = await Promise.all(
        defaultSystems.map(async (sysName) => {
          const sys = new UtilitySystem({
            projectId,
            organizationId,
            system: sysName,
            plannedProgress: 100,
            actualProgress: 0,
            checkpoints: [
              { name: 'Visual Layout Check', status: 'pending' },
              { name: 'Pressure / Load Testing', status: 'pending' },
              { name: 'Signoff Certificate', status: 'pending' },
            ],
          });
          await sys.save();
          return sys;
        })
      );
    }

    return successResponse(systems);
  } catch (error) {
    console.error('Get utilities error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update checkpoint status or progress
async function updateUtilityHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { systemId, checkpointName, status, readings, actualProgress } = body;
    if (!systemId) {
      return errorResponse('systemId is required', 400);
    }

    const system = await UtilitySystem.findOne({ _id: systemId, projectId, organizationId });
    if (!system) {
      return notFoundResponse('Utility system not found');
    }

    if (actualProgress !== undefined) {
      system.actualProgress = actualProgress;
    }

    if (checkpointName && status) {
      const checkpoint = system.checkpoints.find(cp => cp.name === checkpointName);
      if (checkpoint) {
        checkpoint.status = status;
        if (readings) checkpoint.readings = readings;
        checkpoint.checkedAt = new Date();
      }
    }

    await system.save();
    return successResponse(system, 'Utility system status updated successfully');
  } catch (error) {
    console.error('Update utility error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('utilities', 'read', getUtilitiesHandler);
export const PUT = withProjectPermission('utilities', 'update', updateUtilityHandler);
