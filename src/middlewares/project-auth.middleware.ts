// =============================================================================
// InteriorOS Backend — Project-Level Permission Middleware
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { User } from '@/models/user.model';
import { forbiddenResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import type { ModuleName, PermissionAction } from '@/models/role.model';
import { can } from '@/lib/rbac';

/**
 * Middleware that checks project-level permissions for the current user.
 *
 * Usage:
 *   export const GET = withProjectPermission('tasks', 'read', handler);
 *
 * Flow:
 * 1. Authenticates the user via withAuth.
 * 2. Org admins / super admins bypass the check (full access).
 * 3. Looks up the user's ProjectMember record for the projectId in the route.
 * 4. Checks their `permissions` array for the required module + action.
 * 5. If the user isn't a project member or lacks the permission, returns 403.
 */
export function withProjectPermission(
  module: ModuleName,
  action: PermissionAction,
  handler: (req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) => Promise<Response>
) {
  return withAuth(async (req, context, auth) => {
    // Extract projectId from route params
    const params = context?.params ? await context.params : ({} as Record<string, string>);
    const projectId = params.projectId;

    // Admin, or a member of this project whose global + project role allows it (lib/rbac)
    if (!(await can(auth, module, action, projectId))) {
      return forbiddenResponse(
        `You don't have permission to ${action} ${module.replace(/_/g, ' ')}${projectId ? ' in this project' : ''}`
      );
    }

    return handler(req, context, auth);
  });
}

/**
 * Like withProjectPermission, but any one of `modules` is enough — for lists a
 * screen needs as supporting data (e.g. the Tasks screen reads the WBS tree,
 * members for assignees, milestones and inventory with just Activity/Task: View).
 */
export function withAnyProjectPermission(
  modules: ModuleName[],
  action: PermissionAction,
  handler: (req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) => Promise<Response>
) {
  return withAuth(async (req, context, auth) => {
    const params = context?.params ? await context.params : ({} as Record<string, string>);
    const projectId = params.projectId;
    for (const module of modules) {
      if (await can(auth, module, action, projectId)) return handler(req, context, auth);
    }
    return forbiddenResponse(
      `You don't have permission to ${action} ${modules[0].replace(/_/g, ' ')}${projectId ? ' in this project' : ''}`
    );
  });
}

/**
 * Check if a project member has a specific permission.
 * Useful for inline permission checks within handlers.
 */
export async function checkProjectPermission(
  userId: string,
  projectId: string,
  organizationId: string,
  module: ModuleName,
  action: PermissionAction
): Promise<boolean> {
  // Same rules as withProjectPermission (admin, global role, or project role)
  await connectDB();
  const user = await User.findById(userId).select('systemRole email');
  if (!user) return false;
  return can(
    { userId, organizationId, systemRole: user.systemRole, email: user.email } as JwtPayload,
    module,
    action,
    projectId
  );
}
