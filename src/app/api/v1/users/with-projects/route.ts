// =============================================================================
// InteriorOS Backend — Users with Project Memberships API
// Returns all org users enriched with their project assignments, roles, and permissions
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withOrgAdmin } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { User } from '@/models/user.model';
import { ProjectMember } from '@/models/project-member.model';
import { Project } from '@/models/project.model';
import '@/models/role.model';
import { successResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

async function getUsersWithProjectsHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    // 1. Fetch all users in the org
    const users = await User.find({ organizationId, isDeleted: false })
      .populate('role', 'name slug permissions')
      .select('firstName lastName email phone designation department systemRole avatar status role createdAt')
      .sort({ createdAt: -1 });

    // 2. Fetch all project memberships for this org (with project ref)
    const memberships = await ProjectMember.find({ organizationId, isDeleted: false })
      .select('userId projectId projectRole permissions');

    // 3. Fetch all projects (minimal fields)
    const projects = await Project.find({ organizationId, isDeleted: false })
      .select('name status type');

    // Build a project lookup map
    const projectMap = new Map(projects.map((p) => [p._id.toString(), p]));

    // Build a membership lookup: userId -> [{ project, projectRole, permissions }]
    const membershipByUser = new Map<string, any[]>();
    for (const m of memberships) {
      const userId = m.userId.toString();
      if (!membershipByUser.has(userId)) membershipByUser.set(userId, []);
      const project = projectMap.get(m.projectId.toString());
      if (project) {
        membershipByUser.get(userId)!.push({
          projectId: m.projectId,
          projectName: (project as any).name,
          projectStatus: (project as any).status,
          projectType: (project as any).type,
          projectRole: m.projectRole,
          permissions: m.permissions,
        });
      }
    }

    // 4. Enrich each user with their project assignments
    const enriched = users.map((user) => ({
      ...user.toJSON(),
      projectAssignments: membershipByUser.get(user._id.toString()) ?? [],
    }));

    return successResponse(enriched);
  } catch (error) {
    console.error('Get users with projects error:', error);
    return serverErrorResponse();
  }
}

export const GET = withOrgAdmin(getUsersWithProjectsHandler); // the Users tab is admin-only
