// =============================================================================
// InteriorOS Backend — WBS API Route: Hierarchy Management
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Building, Floor, Zone, Area, Package } from '@/models/wbs.model';
import { Task } from '@/models/task.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const createNodeSchema = z.object({
  type: z.enum(['building', 'floor', 'zone', 'area', 'package']),
  name: z.string().min(1, 'Name is required').max(100),
  parentId: z.string().optional(),
  trade: z.enum(['civil', 'interior', 'mep', 'electrical', 'hvac', 'phe', 'fire_fighting', 'elv', 'other']).default('interior'),
  description: z.string().optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

const updateNodeSchema = z.object({
  type: z.enum(['building', 'floor', 'zone', 'area', 'package']),
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1).max(100).optional(),
  trade: z.enum(['civil', 'interior', 'mep', 'electrical', 'hvac', 'phe', 'fire_fighting', 'elv', 'other']).optional(),
  description: z.string().optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

// GET: Retrieve WBS Tree
async function getWbsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    // Fetch all nodes and tasks in parallel
    const [buildings, floors, zones, areas, packages, tasks] = await Promise.all([
      Building.find({ projectId, organizationId }).lean(),
      Floor.find({ projectId, organizationId }).lean(),
      Zone.find({ projectId, organizationId }).lean(),
      Area.find({ projectId, organizationId }).lean(),
      Package.find({ projectId, organizationId }).lean(),
      Task.find({ projectId, organizationId, isDeleted: false }).select('packageId status progress').lean(),
    ]);

    // Map tasks by packageId
    const taskStatsByPackage = new Map<string, { total: number; completed: number; progressSum: number }>();
    for (const t of tasks) {
      if (t.packageId) {
        const pkgId = String(t.packageId);
        const curr = taskStatsByPackage.get(pkgId) || { total: 0, completed: 0, progressSum: 0 };
        curr.total += 1;
        if (t.status === 'completed') curr.completed += 1;
        curr.progressSum += (t.progress || 0);
        taskStatsByPackage.set(pkgId, curr);
      }
    }

    // Helper to format node
    const formatNode = (node: any, type: string, extra: any = {}) => ({
      id: String(node._id),
      name: node.name,
      type,
      description: node.description || '',
      startDate: node.startDate || null,
      endDate: node.endDate || null,
      status: node.status || 'active',
      ...extra,
    });

    // Build hierarchical tree in-memory
    const tree = buildings.map((b: any) => {
      const bFloors = floors
        .filter((f: any) => String(f.buildingId) === String(b._id))
        .map((f: any) => {
          const fZones = zones
            .filter((z: any) => String(z.floorId) === String(f._id))
            .map((z: any) => {
              const zAreas = areas
                .filter((a: any) => String(a.zoneId) === String(z._id))
                .map((a: any) => {
                  const aPackages = packages
                    .filter((p: any) => String(p.areaId) === String(a._id))
                    .map((p: any) => {
                      const stats = taskStatsByPackage.get(String(p._id)) || { total: 0, completed: 0, progressSum: 0 };
                      const pkgProgress = stats.total > 0 ? Math.round(stats.progressSum / stats.total) : 0;
                      return formatNode(p, 'package', {
                        trade: p.trade,
                        taskCount: stats.total,
                        completedTaskCount: stats.completed,
                        progress: pkgProgress,
                      });
                    });

                  return formatNode(a, 'area', { packages: aPackages });
                });

              return formatNode(z, 'zone', { areas: zAreas });
            });

          return formatNode(f, 'floor', { zones: fZones });
        });

      const bStats = taskStatsByPackage.get(String(b._id)) || { total: 0, completed: 0, progressSum: 0 };
      const bProgress = bStats.total > 0 ? Math.round(bStats.progressSum / bStats.total) : 0;
      return formatNode(b, 'building', {
        floors: bFloors,
        taskCount: bStats.total,
        completedTaskCount: bStats.completed,
        progress: bProgress,
      });
    });

    // Check for packages that might not be under existing buildings/areas
    const mappedPkgIds = new Set<string>();
    for (const b of tree) {
      for (const f of (b as any).floors || []) {
        for (const z of (f as any).zones || []) {
          for (const a of (z as any).areas || []) {
            for (const p of (a as any).packages || []) {
              mappedPkgIds.add(String(p.id));
            }
          }
        }
      }
    }

    const unmappedPkgs = packages
      .filter((p: any) => !mappedPkgIds.has(String(p._id)))
      .map((p: any) => {
        const stats = taskStatsByPackage.get(String(p._id)) || { total: 0, completed: 0, progressSum: 0 };
        const pkgProgress = stats.total > 0 ? Math.round(stats.progressSum / stats.total) : 0;
        return formatNode(p, 'package', {
          trade: p.trade,
          taskCount: stats.total,
          completedTaskCount: stats.completed,
          progress: pkgProgress,
        });
      });

    if (unmappedPkgs.length > 0) {
      tree.push({
        id: 'unmapped-general',
        name: 'General Packages',
        type: 'building',
        description: 'Default package container',
        startDate: null,
        endDate: null,
        status: 'active',
        floors: [
          {
            id: 'unmapped-general-floor',
            name: 'General',
            type: 'floor',
            description: '',
            startDate: null,
            endDate: null,
            status: 'active',
            zones: [
              {
                id: 'unmapped-general-zone',
                name: 'General',
                type: 'zone',
                description: '',
                startDate: null,
                endDate: null,
                status: 'active',
                areas: [
                  {
                    id: 'unmapped-general-area',
                    name: 'General Area',
                    type: 'area',
                    description: '',
                    startDate: null,
                    endDate: null,
                    status: 'active',
                    packages: unmappedPkgs,
                  }
                ]
              }
            ]
          }
        ]
      });
    }

    return successResponse(tree);
  } catch (error) {
    console.error('Get WBS Tree error:', error);
    return serverErrorResponse();
  }
}

// POST: Add a node in the WBS
async function addWbsNodeHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = createNodeSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { type, name, parentId, trade, description, startDate, endDate, status } = validation.data;

    const baseData: any = {
      organizationId,
      projectId,
      name,
      description: description || '',
      status: status || 'active',
    };

    if (startDate) baseData.startDate = new Date(startDate);
    if (endDate) baseData.endDate = new Date(endDate);

    if (baseData.startDate && baseData.endDate && baseData.startDate > baseData.endDate) {
      return errorResponse('Start date must be before or equal to end date', 400);
    }

    let createdNode;

    if (type === 'building') {
      createdNode = new Building(baseData);
    } else {
      if (!parentId) {
        return errorResponse('parentId is required for nested WBS nodes', 400);
      }

      if (type === 'floor') {
        const parentExists = await Building.exists({ _id: parentId, projectId, organizationId });
        if (!parentExists) return errorResponse('Parent Building not found', 404);
        createdNode = new Floor({ ...baseData, buildingId: parentId });
      } else if (type === 'zone') {
        const parentExists = await Floor.exists({ _id: parentId, projectId, organizationId });
        if (!parentExists) return errorResponse('Parent Floor not found', 404);
        createdNode = new Zone({ ...baseData, floorId: parentId });
      } else if (type === 'area') {
        const parentExists = await Zone.exists({ _id: parentId, projectId, organizationId });
        if (!parentExists) return errorResponse('Parent Zone not found', 404);
        createdNode = new Area({ ...baseData, zoneId: parentId });
      } else if (type === 'package') {
        const parentExists = await Area.exists({ _id: parentId, projectId, organizationId });
        if (!parentExists) return errorResponse('Parent Area not found', 404);
        if (!trade) return errorResponse('trade is required for packages', 400);
        createdNode = new Package({ ...baseData, areaId: parentId, trade });
      }
    }

    if (!createdNode) {
      return errorResponse('Failed to determine WBS node type', 400);
    }

    await createdNode.save();
    return createdResponse(createdNode, `${type} created successfully`);
  } catch (error) {
    console.error('Create WBS node error:', error);
    return serverErrorResponse();
  }
}

// PUT: Rename or edit a node
async function updateWbsNodeHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = updateNodeSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { type, id, name, trade, description, startDate, endDate, status } = validation.data;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (trade && type === 'package') updateData.trade = trade;
    if (description !== undefined) updateData.description = description;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (status !== undefined) updateData.status = status;

    if (updateData.startDate && updateData.endDate && updateData.startDate > updateData.endDate) {
      return errorResponse('Start date must be before or equal to end date', 400);
    }

    let updatedNode;

    const query = { _id: id, projectId, organizationId };

    if (type === 'building') {
      updatedNode = await Building.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' });
    } else if (type === 'floor') {
      updatedNode = await Floor.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' });
    } else if (type === 'zone') {
      updatedNode = await Zone.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' });
    } else if (type === 'area') {
      updatedNode = await Area.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' });
    } else if (type === 'package') {
      updatedNode = await Package.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' });
    }

    if (!updatedNode) {
      updatedNode =
        (await Building.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' })) ||
        (await Package.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' })) ||
        (await Area.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' })) ||
        (await Floor.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' })) ||
        (await Zone.findOneAndUpdate(query, { $set: updateData }, { returnDocument: 'after' }));
    }

    if (!updatedNode) {
      return notFoundResponse('WBS node not found');
    }

    return successResponse(updatedNode, 'WBS node updated successfully');
  } catch (error) {
    console.error('Update WBS node error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Remove a WBS node (ensures no children or tasks exist)
async function deleteWbsNodeHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const searchParams = req.nextUrl.searchParams;
    
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) {
      return errorResponse('type and id query parameters are required', 400);
    }

    const query = { _id: id, projectId, organizationId };

    if (type === 'building') {
      const hasFloors = await Floor.exists({ buildingId: id, projectId, organizationId });
      if (hasFloors) return errorResponse('Cannot delete building with active floors. Remove floors first.', 400);
      await Building.deleteOne(query);
    } else if (type === 'floor') {
      const hasZones = await Zone.exists({ floorId: id, projectId, organizationId });
      if (hasZones) return errorResponse('Cannot delete floor with active zones. Remove zones first.', 400);
      await Floor.deleteOne(query);
    } else if (type === 'zone') {
      const hasAreas = await Area.exists({ zoneId: id, projectId, organizationId });
      if (hasAreas) return errorResponse('Cannot delete zone with active areas. Remove areas first.', 400);
      await Zone.deleteOne(query);
    } else if (type === 'area') {
      const hasPackages = await Package.exists({ areaId: id, projectId, organizationId });
      if (hasPackages) return errorResponse('Cannot delete area with active packages. Remove packages first.', 400);
      await Area.deleteOne(query);
    } else if (type === 'package') {
      const hasTasks = await Task.exists({ packageId: id, projectId, organizationId, isDeleted: false });
      if (hasTasks) return errorResponse('Cannot delete package with active tasks. Reassign or delete tasks first.', 400);
      await Package.deleteOne(query);
    } else {
      return errorResponse('Invalid node type', 400);
    }

    return successResponse(null, `${type} deleted successfully`);
  } catch (error) {
    console.error('Delete WBS node error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('wbs', 'read', getWbsHandler);
export const POST = withProjectPermission('wbs', 'create', addWbsNodeHandler);
export const PUT = withProjectPermission('wbs', 'update', updateWbsNodeHandler);
export const DELETE = withProjectPermission('wbs', 'delete', deleteWbsNodeHandler);
