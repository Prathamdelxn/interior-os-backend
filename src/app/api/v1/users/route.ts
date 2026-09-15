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

    let users = await User.find({ organizationId }).populate('role', 'name permissions');

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

// POST: Onboard a new team member (admin-only)
async function createUserHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    if (auth.systemRole !== 'super_admin' && auth.systemRole !== 'org_admin') {
      return forbiddenResponse('Only organization admins can create new users');
    }

    await connectDB();
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    const validation = createUserSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { firstName, lastName, email, password, phone, designation, department, role, systemRole } = validation.data;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return errorResponse('User already exists with this email', 400);
    }

    let resolvedRoleId: mongoose.Types.ObjectId | undefined = undefined;
    if (role) {
      if (mongoose.Types.ObjectId.isValid(role)) {
        const roleDoc = await Role.findOne({ _id: role, organizationId });
        if (roleDoc) {
          resolvedRoleId = roleDoc._id as mongoose.Types.ObjectId;
        }
      }
      if (!resolvedRoleId) {
        const roleDoc = await Role.findOne({ slug: role, organizationId });
        if (roleDoc) {
          resolvedRoleId = roleDoc._id as mongoose.Types.ObjectId;
        }
      }
    }

    const newUser = new User({
      firstName,
      lastName,
      email,
      password: password || 'Welcome@123',
      phone,
      designation,
      department,
      role: resolvedRoleId || undefined,
      systemRole: systemRole || 'member',
      status: 'active',
      organizationId,
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
