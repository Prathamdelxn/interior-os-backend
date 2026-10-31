// =============================================================================
// InteriorOS Backend — Project Members API: Invite/Create User
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { ProjectMember } from '@/models/project-member.model';
import { User } from '@/models/user.model';
import { createdResponse, serverErrorResponse, errorResponse, conflictResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { getDefaultPermissionsForRole } from '@/lib/project-permissions';
import type { ProjectRole } from '@/lib/project-permissions';
import { resolveProjectRole } from '@/lib/rbac';
import { z } from 'zod';

const inviteMemberSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email format'),
  // Optional — defaults to 'welcome123', same as the construction app
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  designation: z.string().optional(),
  department: z.string().optional(),
  projectRole: z.enum([
    'project_manager',
    'site_engineer',
    'quantity_surveyor',
    'designer',
    'client_representative',
    'sub_contractor',
    'viewer'
  ]).default('viewer'),
  // Optional org Role to use as this member's project role
  roleId: z.string().optional(),
});

// POST: Create a new user and assign them to the project
async function inviteMemberHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = inviteMemberSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { firstName, lastName, email, password, designation, department, roleId } = validation.data;
    let { projectRole } = validation.data;
    let linkedRole: Awaited<ReturnType<typeof resolveProjectRole>> = null;
    if (roleId) {
      linkedRole = await resolveProjectRole(organizationId, roleId);
      if (!linkedRole) return errorResponse('Role not found in this organization', 400);
      projectRole = linkedRole.projectRole;
    }

    // Check if the user email already exists in the organization (including soft-deleted)
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      organizationId,
      isDeleted: { $in: [true, false] },
    });
    if (existingUser && !existingUser.isDeleted) {
      return conflictResponse('A user with this email already exists in the organization. Please use the Add Existing Member flow.');
    }

    // A deleted user keeps their record (soft delete) — bring it back with the new details
    const newUser =
      existingUser ??
      new User({
        organizationId,
        email,
        systemRole: 'member',
        isEmailVerified: true,
      });

    // Ensure user has a valid global role
    let globalRole = newUser.role;
    if (!globalRole && linkedRole?.roleId) {
      globalRole = linkedRole.roleId;
    }

    Object.assign(newUser, {
      firstName,
      lastName,
      password: password || 'welcome123',
      designation,
      department,
      role: globalRole || undefined,
      status: 'active',
      isDeleted: false,
      deletedAt: undefined,
    });

    await newUser.save();

    // Auto-populate permissions from the role preset
    const defaultPermissions = linkedRole ? (linkedRole.permissions as any) : getDefaultPermissionsForRole(projectRole as ProjectRole);

    // Create the Project Member link with permissions (reusing a removed one for this project)
    const member =
      (await ProjectMember.findOne({ organizationId, projectId, userId: newUser._id })) ??
      new ProjectMember({ organizationId, projectId, userId: newUser._id });
    Object.assign(member, {
      projectRole,
      permissions: defaultPermissions,
      roleId: linkedRole ? linkedRole.roleId : undefined,
      isDeleted: false,
      deletedAt: undefined,
    });

    await member.save();

    // Remove password from response
    const userObj = newUser.toObject() as any;
    delete userObj.password;

    return createdResponse({ user: userObj, member }, 'User created and added to project successfully');
  } catch (error) {
    console.error('Invite project member error:', error);
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('users', 'create', inviteMemberHandler);
