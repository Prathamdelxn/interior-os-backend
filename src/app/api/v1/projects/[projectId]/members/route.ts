// =============================================================================
// InteriorOS Backend — Project Members API: List & Add
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission, withAnyProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { ProjectMember } from '@/models/project-member.model';
import { User } from '@/models/user.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, conflictResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { getDefaultPermissionsForRole } from '@/lib/project-permissions';
import type { ProjectRole } from '@/lib/project-permissions';
import { resolveProjectRole } from '@/lib/rbac';
import { z } from 'zod';

const addMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  projectRole: z.enum(['project_manager', 'site_engineer', 'quantity_surveyor', 'designer', 'client_representative', 'sub_contractor', 'viewer']).default('viewer'),
  // Optional org Role to use as this member's project role (like construction)
  roleId: z.string().optional(),
});

// GET: List all project members
async function getMembersHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const members = await ProjectMember.find({ projectId, organizationId, isDeleted: false })
      .populate({
        path: 'userId',
        select: 'firstName lastName email designation avatar department systemRole',
      })
      .populate({ path: 'roleId', select: 'name slug permissions' })
      .lean();

    // Also include organization admins/super admins so they can be assigned to activities
    const existingUserIds = new Set(
      members
        .map((m: any) => m.userId?._id ? String(m.userId._id) : String(m.userId))
        .filter(Boolean)
    );

    const adminUsers = await User.find({
      organizationId,
      systemRole: { $in: ['super_admin', 'org_admin'] },
      isDeleted: false,
    }).select('firstName lastName email designation avatar department systemRole').lean();

    const formattedMembers: any[] = [...members];
    for (const admin of adminUsers) {
      if (!existingUserIds.has(String(admin._id))) {
        formattedMembers.push({
          _id: `admin-${admin._id}`,
          projectId,
          userId: admin,
          projectRole: admin.systemRole === 'super_admin' ? 'project_manager' : 'project_manager',
          roleTitle: admin.systemRole === 'super_admin' ? 'Super Admin' : 'Admin',
          isOrgAdmin: true,
        });
      }
    }

    return successResponse(formattedMembers);
  } catch (error) {
    console.error('List project members error:', error);
    return serverErrorResponse();
  }
}

// POST: Add a member to a project
async function addMemberHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = addMemberSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { userId, roleId } = validation.data;
    let { projectRole } = validation.data;

    // Check if user exists in the organization
    const user = await User.findOne({ _id: userId, organizationId, isDeleted: false });
    if (!user) {
      return errorResponse('User not found in organization', 404);
    }

    // Linked org role (preferred) or the preset's default permissions
    let defaultPermissions = getDefaultPermissionsForRole(projectRole as ProjectRole);
    let linkedRoleId: any = undefined;
    if (roleId) {
      const resolved = await resolveProjectRole(organizationId, roleId);
      if (!resolved) return errorResponse('Role not found in this organization', 400);
      linkedRoleId = resolved.roleId;
      projectRole = resolved.projectRole;
      defaultPermissions = resolved.permissions as any;
    }

    // Check if user is already a member of this project (even if soft-deleted, we can reactivate)
    const existingMember = await ProjectMember.findOne({ projectId, userId, organizationId });
    if (existingMember) {
      if (!existingMember.isDeleted) {
        return conflictResponse('User is already a member of this project');
      }
      // Reactivate
      existingMember.isDeleted = false;
      existingMember.deletedAt = undefined;
      existingMember.projectRole = projectRole;
      existingMember.permissions = defaultPermissions;
      existingMember.roleId = linkedRoleId;
      await existingMember.save();
      return successResponse(existingMember, 'Member added back to project successfully');
    }

    const member = new ProjectMember({
      organizationId,
      projectId,
      userId,
      projectRole,
      permissions: defaultPermissions,
      ...(linkedRoleId ? { roleId: linkedRoleId } : {}),
    });

    await member.save();
    return createdResponse(member, 'Member added to project successfully');
  } catch (error) {
    console.error('Add project member error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAnyProjectPermission(['users', 'tasks'], 'read', getMembersHandler);
export const POST = withProjectPermission('users', 'create', addMemberHandler);
