// =============================================================================
// InteriorOS Backend — Users API: Get, Update, Delete Single User
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { User } from '@/models/user.model';
import { ProjectMember } from '@/models/project-member.model';
import { Role } from '@/models/role.model';
import { successResponse, errorResponse, forbiddenResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const updateUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  email: z.string().email('Valid email is required').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  phone: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  systemRole: z.enum(['super_admin', 'org_admin', 'manager', 'member', 'viewer']).optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
});

// GET /api/v1/users/[userId]
async function getUserHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { userId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return errorResponse('Invalid user ID', 400);
    }

    const user = await User.findOne({ _id: userId, organizationId, isDeleted: false })
      .populate('role', 'name slug permissions');

    if (!user) {
      return notFoundResponse('User not found');
    }

    return successResponse(user);
  } catch (error) {
    console.error('Get user error:', error);
    return serverErrorResponse();
  }
}

// PATCH /api/v1/users/[userId] — Update user details
async function updateUserHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    if (auth.systemRole !== 'super_admin' && auth.systemRole !== 'org_admin') {
      return forbiddenResponse('Only organization admins can update users');
    }

    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { userId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return errorResponse('Invalid user ID', 400);
    }

    const user = await User.findOne({ _id: userId, organizationId, isDeleted: false });
    if (!user) {
      return notFoundResponse('User not found');
    }

    const body = await req.json();
    const validation = updateUserSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { firstName, lastName, email, password, phone, designation, department, role, systemRole, status } = validation.data;

    // Check unique email if email is being changed
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
      if (existing) {
        return errorResponse('Another user already exists with this email', 400);
      }
      user.email = email.toLowerCase();
    }

    if (role !== undefined) {
      if (role) {
        let roleDoc: any = null;
        if (mongoose.Types.ObjectId.isValid(role)) {
          roleDoc = await Role.findOne({ _id: role, organizationId });
        }
        if (!roleDoc) {
          roleDoc = await Role.findOne({ slug: role, organizationId });
        }
        if (roleDoc) {
          user.role = roleDoc._id;
        } else {
          user.role = undefined as any;
        }
      } else {
        user.role = undefined as any;
      }
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (designation !== undefined) user.designation = designation;
    if (department !== undefined) user.department = department;
    if (systemRole) user.systemRole = systemRole;
    if (status) user.status = status;

    if (password && password.trim().length >= 8) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password.trim(), salt);
    }

    await user.save();

    const updatedUser = await User.findById(userId).populate('role', 'name slug permissions');

    return successResponse(updatedUser, 'User updated successfully');
  } catch (error: any) {
    console.error('Update user error:', error);
    return serverErrorResponse();
  }
}

// DELETE /api/v1/users/[userId] — Delete/deactivate user
async function deleteUserHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    if (auth.systemRole !== 'super_admin' && auth.systemRole !== 'org_admin') {
      return forbiddenResponse('Only organization admins can delete users');
    }

    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { userId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return errorResponse('Invalid user ID', 400);
    }

    // Prevent self-deletion
    if (auth.userId === userId) {
      return errorResponse('You cannot delete your own account', 400);
    }

    const user = await User.findOne({ _id: userId, organizationId, isDeleted: false });
    if (!user) {
      return notFoundResponse('User not found');
    }

    // Soft delete the user
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.status = 'inactive';
    await user.save();

    // Soft delete project memberships
    await ProjectMember.updateMany(
      { userId, organizationId },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );

    return successResponse({ deletedUserId: userId }, 'User deleted successfully');
  } catch (error) {
    console.error('Delete user error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getUserHandler);
export const PATCH = withAuth(updateUserHandler);
export const DELETE = withAuth(deleteUserHandler);
