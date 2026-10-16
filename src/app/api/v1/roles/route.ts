// =============================================================================
// InteriorOS Backend — Roles API: List & Create Organization Roles
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Role, DEFAULT_ROLES, ALL_MODULES, ALL_ACTIONS } from '@/models/role.model';
import type { ModuleName, PermissionAction } from '@/models/role.model';
import { can, isOrgAdmin, getGlobalPermissions, permissionListAllows } from '@/lib/rbac';
import { successResponse, createdResponse, errorResponse, forbiddenResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { ensureOrgPermissionDefaults } from '@/lib/role-defaults';
import { z } from 'zod';

const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(50),
  description: z.string().max(200).optional(),
  permissions: z.array(
    z.object({
      module: z.enum(ALL_MODULES as [ModuleName, ...ModuleName[]]),
      actions: z.array(z.enum(ALL_ACTIONS as [PermissionAction, ...PermissionAction[]])),
    })
  ).optional(),
});

// GET /api/v1/roles: Fetch all roles for the organization (auto-ensures default roles exist)
async function getRolesHandler(_req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    const keys = [
      'admin',
      'project_manager',
      'sales_executive',
      'designer',
      'quantity_surveyor',
      'site_engineer',
      'sub_contractor',
      'client_representative',
      'viewer',
    ] as const;

    // Ensure all standard system roles exist for this organization (upsert missing ones)
    for (const key of keys) {
      const def = DEFAULT_ROLES[key];
      await Role.findOneAndUpdate(
        { organizationId, slug: def.slug },
        {
          $setOnInsert: {
            organizationId,
            name: def.name,
            slug: def.slug,
            description: def.description,
            permissions: def.permissions,
            isSystem: true,
            isActive: true,
            isDeleted: false,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
    }

    // Add modules introduced after these roles were saved (once per record)
    await ensureOrgPermissionDefaults(organizationId);

    const roles = await Role.find({ organizationId, isDeleted: false }).sort({ createdAt: 1 });

    return successResponse(roles);
  } catch (error) {
    console.error('List roles error:', error);
    return serverErrorResponse();
  }
}

// POST /api/v1/roles: Create custom role
async function createRoleHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    // Org admins, or users whose role has Roles > Create
    if (!(await can(auth, 'roles', 'create'))) {
      return forbiddenResponse("You don't have permission to create roles");
    }

    await connectDB();
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    const validation = createRoleSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { name, description, permissions } = validation.data;

    // No self-escalation: a non-admin can't grant permissions they don't hold
    if (permissions && !isOrgAdmin(auth)) {
      const own = await getGlobalPermissions(auth.userId);
      const exceeding = permissions.flatMap((p) =>
        p.actions.filter((a) => !permissionListAllows(own, p.module, a)).map((a) => `${p.module}.${a}`)
      );
      if (exceeding.length > 0) {
        return forbiddenResponse(`You can't grant permissions you don't have yourself (${exceeding.slice(0, 3).join(', ')}${exceeding.length > 3 ? ', …' : ''})`);
      }
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const existing = await Role.findOne({ organizationId, slug, isDeleted: false });
    if (existing) {
      return errorResponse('A role with this name already exists in your organization', 400);
    }

    const role = await Role.create({
      organizationId,
      name,
      slug,
      description,
      permissions: (permissions as any) || [],
      isSystem: false,
      isActive: true,
      createdBy: auth.userId,
    });

    return createdResponse(role, 'Role created successfully');
  } catch (error) {
    console.error('Create role error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getRolesHandler);
export const POST = withAuth(createRoleHandler);
