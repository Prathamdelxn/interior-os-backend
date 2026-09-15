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
  trade: z.enum(['civil', 'interior', 'mep', 'electrical', 'hvac', 'phe', 'fire_fighting', 'elv', 'other']).optional(),
});

const updateNodeSchema = z.object({
  type: z.enum(['building', 'floor', 'zone', 'area', 'package']),
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1).max(100).optional(),
  trade: z.enum(['civil', 'interior', 'mep', 'electrical', 'hvac', 'phe', 'fire_fighting', 'elv', 'other']).optional(),
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
                      return {
                        id: String(p._id),
                        name: p.name,
                        type: 'package',
                        trade: p.trade,
                        taskCount: stats.total,
                        completedTaskCount: stats.completed,
                        progress: pkgProgress,
                      };
                    });

                  return {
                    id: String(a._id),
                    name: a.name,
                    type: 'area',
                    packages: aPackages,
                  };
                });

              return {
                id: String(z._id),
                name: z.name,
                type: 'zone',
                areas: zAreas,
              };
            });

          return {
            id: String(f._id),
            name: f.name,
            type: 'floor',
            zones: fZones,
          };
        });

      return {
        id: String(b._id),
        name: b.name,
        type: 'building',
        floors: bFloors,
      };
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
        return {
          id: String(p._id),
          name: p.name,
          type: 'package',
          trade: p.trade,
          taskCount: stats.total,
          completedTaskCount: stats.completed,
          progress: pkgProgress,
        };
      });

    if (unmappedPkgs.length > 0) {
      tree.push({
        id: 'unmapped-general',
        name: 'General Packages',
        type: 'building',
        floors: [
          {
            id: 'unmapped-general-floor',
            name: 'General',
            type: 'floor',
            zones: [
              {
                id: 'unmapped-general-zone',
                name: 'General',
                type: 'zone',
                areas: [
                  {
                    id: 'unmapped-general-area',
                    name: 'General Area',
                    type: 'area',
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

    const { type, name, parentId, trade } = validation.data;

    let createdNode;

    if (type === 'building') {
      createdNode = new Building({ organizationId, projectId, name });
    } else {
      if (!parentId) {
        return errorResponse('parentId is required for nested WBS nodes', 400);
      }

      if (type === 'floor') {
        const parentExists = await Building.exists({ _id: parentId, projectId, organizationId });
        if (!parentExists) return errorResponse('Parent Building not found', 404);
        createdNode = new Floor({ organizationId, projectId, buildingId: parentId, name });
      } else if (type === 'zone') {
        const parentExists = await Floor.exists({ _id: parentId, projectId, organizationId });
        if (!parentExists) return errorResponse('Parent Floor not found', 404);
        createdNode = new Zone({ organizationId, projectId, floorId: parentId, name });
      } else if (type === 'area') {
        const parentExists = await Zone.exists({ _id: parentId, projectId, organizationId });
        if (!parentExists) return errorResponse('Parent Zone not found', 404);
        createdNode = new Area({ organizationId, projectId, zoneId: parentId, name });
      } else if (type === 'package') {
        const parentExists = await Area.exists({ _id: parentId, projectId, organizationId });
        if (!parentExists) return errorResponse('Parent Area not found', 404);
        if (!trade) return errorResponse('trade is required for packages', 400);
        createdNode = new Package({ organizationId, projectId, areaId: parentId, name, trade });
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

    const { type, id, name, trade } = validation.data;
    const updateData: any = {};
    if (name) updateData.name = name;
    if (trade && type === 'package') updateData.trade = trade;

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
      return notFoundResponse(`${type} node not found`);
    }

    return successResponse(updatedNode, `${type} node updated successfully`);
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
      const hasFloors = await Floor.exists({ buildingId: id });
      if (hasFloors) {
        return errorResponse('Cannot delete building: floors are still linked to it.', 400);
      }
      await Building.deleteOne(query);
    } else if (type === 'floor') {
      const hasZones = await Zone.exists({ floorId: id });
      if (hasZones) {
        return errorResponse('Cannot delete floor: zones are still linked to it.', 400);
      }
      await Floor.deleteOne(query);
    } else if (type === 'zone') {
      const hasAreas = await Area.exists({ zoneId: id });
      if (hasAreas) {
        return errorResponse('Cannot delete zone: areas are still linked to it.', 400);
      }
      await Zone.deleteOne(query);
    } else if (type === 'area') {
      const hasPackages = await Package.exists({ areaId: id });
      if (hasPackages) {
        return errorResponse('Cannot delete area: packages are still linked to it.', 400);
      }
      await Area.deleteOne(query);
    } else if (type === 'package') {
      const hasTasks = await Task.exists({ packageId: id, isDeleted: false });
      if (hasTasks) {
        return errorResponse('Cannot delete package: active tasks are still linked to it.', 400);
      }
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
