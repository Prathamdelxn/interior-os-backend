// =============================================================================
// InteriorOS Backend — Roles API: Get, Update & Delete Role by ID
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Role, ALL_MODULES, ALL_ACTIONS } from '@/models/role.model';
import type { ModuleName, PermissionAction, IPermission } from '@/models/role.model';
import { ProjectMember } from '@/models/project-member.model';
import { can, isOrgAdmin, getGlobalPermissions, permissionListAllows } from '@/lib/rbac';
import { User } from '@/models/user.model';
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';
import { z } from 'zod';

const updateRoleSchema = z.object({
  name: z.string().min(1, 'Role name cannot be empty').max(50).optional(),
  description: z.string().max(200).optional(),
  permissions: z
    .array(
      z.object({
        module: z.enum(ALL_MODULES as [ModuleName, ...ModuleName[]]),
        actions: z.array(z.enum(ALL_ACTIONS as [PermissionAction, ...PermissionAction[]])),
      })
    )
    .optional(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/roles/[id]: Get single role
async function getRoleHandler(
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { id } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse('Invalid role ID', 400);
    }

    const role = await Role.findOne({ _id: id, organizationId, isDeleted: false });
    if (!role) {
      return notFoundResponse('Role not found');
    }

    return successResponse(role);
  } catch (error) {
    console.error('Get role error:', error);
    return serverErrorResponse();
  }
}

// PATCH / PUT /api/v1/roles/[id]: Update custom role
async function updateRoleHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    // Org admins, or users whose role has Roles > Update
    if (!(await can(auth, 'roles', 'update'))) {
      return forbiddenResponse("You don't have permission to update roles");
    }

    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { id } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse('Invalid role ID', 400);
    }

    const role = await Role.findOne({ _id: id, organizationId, isDeleted: false });
    if (!role) {
      return notFoundResponse('Role not found');
    }

    const body = await req.json();
    const validation = updateRoleSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { name, description, permissions, isActive } = validation.data;

    // The Admin role always has full access — it can't be changed
    if (role.slug === 'admin' && (permissions !== undefined || isActive !== undefined)) {
      return forbiddenResponse('The Admin role is locked and cannot be modified');
    }

    // No self-escalation: a non-admin can't ADD permissions they don't hold.
    // Permissions the role already has are left alone, so other edits still save.
    if (permissions && !isOrgAdmin(auth)) {
      const own = await getGlobalPermissions(auth.userId);
      const current = (role.permissions || []) as IPermission[];
      const exceeding = permissions.flatMap((p) =>
        p.actions
          .filter((a) => !permissionListAllows(current, p.module, a)) // newly added
          .filter((a) => !permissionListAllows(own, p.module, a))
          .map((a) => `${p.module}.${a}`)
      );
      if (exceeding.length > 0) {
        return forbiddenResponse(`You can't grant permissions you don't have yourself (${exceeding.slice(0, 3).join(', ')}${exceeding.length > 3 ? ', …' : ''})`);
      }
    }

    if (name && name !== role.name) {
      if (role.isSystem) {
        return forbiddenResponse('Cannot rename built-in system roles');
      }
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const existing = await Role.findOne({
        _id: { $ne: id },
        organizationId,
        slug,
        isDeleted: false,
      });
      if (existing) {
        return errorResponse('A role with this name already exists', 400);
      }
      role.name = name;
      role.slug = slug;
    }

    if (description !== undefined) role.description = description;
    if (permissions !== undefined) {
      const submittedModules = new Set(permissions.map((p) => p.module));
      const preserved = (role.permissions || []).filter((p: any) => !submittedModules.has(p.module));
      role.permissions = [...permissions, ...preserved] as any;
    }
    if (isActive !== undefined) role.isActive = isActive;

    await role.save();

    return successResponse(role, 'Role updated successfully');
  } catch (error) {
    console.error('Update role error:', error);
    return serverErrorResponse();
  }
}

// DELETE /api/v1/roles/[id]: Soft-delete custom role
async function deleteRoleHandler(
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    // Org admins, or users whose role has Roles > Delete
    if (!(await can(auth, 'roles', 'delete'))) {
      return forbiddenResponse("You don't have permission to delete roles");
    }

    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { id } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse('Invalid role ID', 400);
    }

    const role = await Role.findOne({ _id: id, organizationId, isDeleted: false });
    if (!role) {
      return notFoundResponse('Role not found');
    }

    if (role.isSystem) {
      return forbiddenResponse('Cannot delete built-in system roles');
    }

    // Check if any active users have this role assigned
    const assignedUsersCount = await User.countDocuments({
      organizationId,
      role: id,
      isDeleted: false,
    });

    if (assignedUsersCount > 0) {
      return errorResponse(
        `Cannot delete role because it is currently assigned to ${assignedUsersCount} active user(s). Reassign them first.`,
        400
      );
    }

    // ...or used as a project role
    const linkedMembersCount = await ProjectMember.countDocuments({ organizationId, roleId: id, isDeleted: false });
    if (linkedMembersCount > 0) {
      return errorResponse(
        `Cannot delete role because ${linkedMembersCount} project member(s) use it as their project role. Change their project role first.`,
        400
      );
    }

    role.isDeleted = true;
    await role.save();

    return successResponse({ deletedId: id }, 'Role deleted successfully');
  } catch (error) {
    console.error('Delete role error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getRoleHandler);
export const PATCH = withAuth(updateRoleHandler);
export const PUT = withAuth(updateRoleHandler);
export const DELETE = withAuth(deleteRoleHandler);
