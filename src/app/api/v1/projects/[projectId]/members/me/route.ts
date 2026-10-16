// =============================================================================
// InteriorOS Backend — Current User Project Permissions API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { ProjectMember } from '@/models/project-member.model';
import { successResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { getGlobalPermissions, mergePermissions } from '@/lib/rbac';

// GET: Get the current user's membership & permissions for this project
async function getMyPermissionsHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    // Org admins / super admins have full access — return a special flag
    if (auth.systemRole === 'super_admin' || auth.systemRole === 'org_admin') {
      return successResponse({
        isMember: true,
        isAdmin: true,
        projectRole: 'admin',
        permissions: [], // Empty means "all access" when isAdmin is true
      });
    }

    // Effective permissions here = global role + role on this project
    // (same rule the API enforces, see lib/rbac)
    const member = await ProjectMember.findOne({
      projectId,
      userId: auth.userId,
      organizationId,
      isDeleted: false,
    }).populate({ path: 'roleId', select: 'name slug permissions' });

    const globalPerms = await getGlobalPermissions(auth.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkedRole = member?.roleId as any;
    const projectPerms = member
      ? (linkedRole && typeof linkedRole === 'object' ? linkedRole.permissions : member.permissions)
      : [];

    return successResponse({
      isMember: !!member,
      isAdmin: false,
      projectRole: member?.projectRole ?? null,
      roleId: linkedRole?._id ?? null,
      roleName: linkedRole?.name ?? null,
      // Non-members get nothing here — membership is required inside a project
      permissions: member ? mergePermissions(globalPerms, projectPerms) : [],
    });
  } catch (error) {
    console.error('Get my permissions error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getMyPermissionsHandler);
