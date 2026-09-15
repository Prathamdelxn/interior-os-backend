// =============================================================================
// InteriorOS Backend — Project Members API: Update & Delete Member
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { ProjectMember } from '@/models/project-member.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { getDefaultPermissionsForRole } from '@/lib/project-permissions';
import type { ProjectRole } from '@/lib/project-permissions';
import { z } from 'zod';

const updateMemberSchema = z.object({
  projectRole: z.enum([
    'project_manager', 'site_engineer', 'quantity_surveyor',
    'designer', 'client_representative', 'sub_contractor', 'viewer'
  ]).optional(),
  permissions: z.array(
    z.object({
      module: z.string(),
      actions: z.array(z.string()),
    })
  ).optional(),
  resetPermissions: z.boolean().optional(), // If true, reset permissions to role defaults
});

// PATCH: Update a member's role and/or permissions
async function updateMemberHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, memberId } = await context.params;
    const body = await req.json();

    const validation = updateMemberSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { projectRole, permissions, resetPermissions } = validation.data;

    const member = await ProjectMember.findOne({
      _id: memberId,
      projectId,
      organizationId,
      isDeleted: false,
    });

    if (!member) {
      return notFoundResponse('Project member not found');
    }

    // 1. If explicit resetPermissions flag is set, reset to current/new role's defaults
    if (resetPermissions) {
      if (projectRole && projectRole !== member.projectRole) {
        member.projectRole = projectRole;
      }
      member.permissions = getDefaultPermissionsForRole(member.projectRole as ProjectRole);
      member.markModified('permissions');
    }
    // 2. Otherwise, if custom permissions are provided, apply them
    else if (permissions) {
      if (projectRole && projectRole !== member.projectRole) {
        member.projectRole = projectRole;
      }
      member.permissions = permissions as any;
      member.markModified('permissions');
    }
    // 3. Otherwise, if only the role is changing, update role and reset to defaults
    else if (projectRole && projectRole !== member.projectRole) {
      member.projectRole = projectRole;
      member.permissions = getDefaultPermissionsForRole(projectRole as ProjectRole);
      member.markModified('permissions');
    }

    await member.save();

    // Re-populate user data for response
    const populated = await ProjectMember.findById(member._id).populate({
      path: 'userId',
      select: 'firstName lastName email designation avatar department systemRole',
    });

    return successResponse(populated, 'Member updated successfully');
  } catch (error) {
    console.error('Update project member error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft-delete a member from the project
async function deleteMemberHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, memberId } = await context.params;

    const member = await ProjectMember.findOneAndUpdate(
      { _id: memberId, projectId, organizationId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!member) {
      return notFoundResponse('Project member not found');
    }

    return successResponse(null, 'Member removed from project successfully');
  } catch (error) {
    console.error('Delete project member error:', error);
    return serverErrorResponse();
  }
}

export const PATCH = withProjectPermission('users', 'update', updateMemberHandler);
export const DELETE = withProjectPermission('users', 'delete', deleteMemberHandler);
