// =============================================================================
// InteriorOS Backend — Users API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { User } from '@/models/user.model';
import { ProjectMember } from '@/models/project-member.model';
import { Role } from '@/models/role.model';
import { successResponse, createdResponse, errorResponse, forbiddenResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { isOrgAdmin, can } from '@/lib/rbac';
import { z } from 'zod';
import mongoose from 'mongoose';

const createUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  phone: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  systemRole: z.enum(['super_admin', 'org_admin', 'manager', 'member', 'viewer']).optional(),
});

// GET: List all users in the caller's organization
async function getUsersHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    const searchParams = req.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const permission = searchParams.get('permission');

    // Deleted users are soft-deleted (isDeleted) — never list them
    let users = await User.find({ organizationId, isDeleted: { $ne: true } }).populate('role', 'name permissions');

    // Filter by project membership, if requested
    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      const memberships = await ProjectMember.find({ projectId, organizationId }).select('userId permissions');
      const memberMap = new Map(memberships.map((m) => [m.userId.toString(), m]));

      users = users.filter((u) => {
        const roleDoc = u.role as any;
        const isGlobalAdmin =
          u.systemRole === 'super_admin' ||
          u.systemRole === 'org_admin' ||
          roleDoc?.permissions?.some((p: any) => p.actions?.includes('manage'));
        return isGlobalAdmin || memberMap.has((u._id as mongoose.Types.ObjectId).toString());
      });

      // Secondary filter by specific permission within the project, if requested
      if (permission) {
        users = users.filter((u) => {
          if (u.systemRole === 'super_admin' || u.systemRole === 'org_admin') return true;

          const roleDoc = u.role as any;
          const hasRolePerm = roleDoc?.permissions?.some(
            (p: any) => p.module === permission || p.actions?.includes(permission)
          );
          if (hasRolePerm) return true;

          const membership = memberMap.get((u._id as mongoose.Types.ObjectId).toString());
          if (membership?.permissions?.length) {
            return membership.permissions.some(
              (p: any) => p.module === permission || p.actions?.includes(permission)
            );
          }
          return false;
        });
      }
    } else if (permission) {
      // Permission filter without a project scope: check org-level role only
      users = users.filter((u) => {
        if (u.systemRole === 'super_admin' || u.systemRole === 'org_admin') return true;
        const roleDoc = u.role as any;
        return roleDoc?.permissions?.some((p: any) => p.module === permission || p.actions?.includes(permission));
      });
    }

    return successResponse(users);
  } catch (error) {
    console.error('List users error:', error);
    return serverErrorResponse();
  }
}

// POST: Onboard a new team member
async function createUserHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    const canCreate = isOrgAdmin(auth) || (await can(auth, 'users', 'create'));
    if (!canCreate) {
      return forbiddenResponse('Only organization admins or users with user creation permission can create new users');
    }

    await connectDB();
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    const validation = createUserSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { firstName, lastName, email, password, phone, designation, department, role, systemRole } = validation.data;

    const existing = await User.findOne({
      email: email.toLowerCase(),
      isDeleted: { $in: [true, false] },
    });
    // A user deleted from this organization can be created again (their record is restored below)
    const restoring = !!existing && existing.isDeleted && String(existing.organizationId) === String(organizationId);
    if (existing && !restoring) {
      return errorResponse('User already exists with this email', 400);
    }

    let resolvedRoleId: mongoose.Types.ObjectId | undefined = undefined;
    let finalSystemRole = systemRole || 'member';
    if (role) {
      if (mongoose.Types.ObjectId.isValid(role)) {
        const roleDoc = await Role.findOne({ _id: role, organizationId });
        if (roleDoc) {
          resolvedRoleId = roleDoc._id as mongoose.Types.ObjectId;
          if (roleDoc.slug === 'admin' || roleDoc.slug === 'org_admin') {
            finalSystemRole = 'org_admin';
          }
        }
      }
      if (!resolvedRoleId) {
        const normalizedSlug = role.toLowerCase().replace(/_/g, '-');
        const altSlug = role.toLowerCase().replace(/-/g, '_');
        const roleDoc = await Role.findOne({
          organizationId,
          $or: [
            { slug: role.toLowerCase() },
            { slug: normalizedSlug },
            { slug: altSlug },
            { name: new RegExp('^' + role.replace(/[-_]/g, ' ') + '$', 'i') },
          ],
        });
        if (roleDoc) {
          resolvedRoleId = roleDoc._id as mongoose.Types.ObjectId;
          if (roleDoc.slug === 'admin' || roleDoc.slug === 'org_admin') {
            finalSystemRole = 'org_admin';
          }
        }
      }
    }

    const newUser = restoring ? existing! : new User({ email, organizationId });
    Object.assign(newUser, {
      firstName,
      lastName,
      password: password || 'welcome123', // same default as the construction app
      phone,
      designation,
      department,
      role: resolvedRoleId || undefined,
      systemRole: finalSystemRole,
      status: 'active',
      isDeleted: false,
      deletedAt: undefined,
    });

    await newUser.save();

    const result = await User.findById(newUser._id).populate('role', 'name permissions');

    return createdResponse(result, 'User created successfully');
  } catch (error: any) {
    console.error('Create user error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return errorResponse(messages.join(', '), 400);
    }

    return serverErrorResponse();
  }
}

export const GET = withAuth(getUsersHandler);
export const POST = withAuth(createUserHandler);
