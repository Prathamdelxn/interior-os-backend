// =============================================================================
// InteriorOS Backend — Roles API: Get, Update & Delete Role by ID
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Role } from '@/models/role.model';
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
        module: z.string(),
        actions: z.array(z.string()),
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
    if (auth.systemRole !== 'super_admin' && auth.systemRole !== 'org_admin') {
      return forbiddenResponse('Only organization admins can update roles');
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
    if (permissions !== undefined) role.permissions = permissions as any;
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
    if (auth.systemRole !== 'super_admin' && auth.systemRole !== 'org_admin') {
      return forbiddenResponse('Only organization admins can delete roles');
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
