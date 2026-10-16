// =============================================================================
// InteriorOS Backend — Auth API: Change Password (logged-in user)
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { User } from '@/models/user.model';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

async function changePasswordHandler(req: NextRequest, _context: unknown, auth: JwtPayload) {
  try {
    await connectDB();

    const validation = changePasswordSchema.safeParse(await req.json());
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }
    const { currentPassword, newPassword } = validation.data;

    const user = await User.findById(auth.userId).select('+password');
    if (!user) {
      return notFoundResponse('User not found');
    }

    if (!(await user.comparePassword(currentPassword))) {
      return errorResponse('Current password is incorrect', 400);
    }
    if (currentPassword === newPassword) {
      return errorResponse('New password must be different from the current password', 400);
    }

    user.password = newPassword; // hashed by the pre-save hook
    await user.save();

    return successResponse(null, 'Password updated successfully');
  } catch (error) {
    console.error('Change password error:', error);
    return serverErrorResponse();
  }
}

export const PATCH = withAuth(changePasswordHandler);
export const POST = withAuth(changePasswordHandler);
