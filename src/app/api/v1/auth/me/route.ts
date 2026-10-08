// =============================================================================
// InteriorOS Backend — Auth API: Get Current User (Me)
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { User } from '@/models/user.model';
import { Organization } from '@/models/organization.model';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

async function handler(_req: NextRequest, _context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();

    const user = await User.findById(auth.userId).populate('role');
    if (!user) {
      return notFoundResponse('User not found');
    }

    const organization = await Organization.findById(auth.organizationId);

    return successResponse({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatar: user.avatar,
        phone: user.phone,
        designation: user.designation,
        department: user.department,
        systemRole: user.systemRole,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        preferences: user.preferences,
        lastLoginAt: user.lastLoginAt,
        role: user.role,
      },
      organization: organization
        ? {
            id: organization._id,
            name: organization.name,
            slug: organization.slug,
            logo: organization.logo,
            industry: organization.industry,
            subscription: organization.subscription,
            address: organization.address,
            settings: organization.settings,
          }
        : null,
    });
  } catch (error) {
    console.error('Get me error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(handler);
