// =============================================================================
// InteriorOS Backend — CRM Customer Drawings Share Link API
// Allows team to generate, configure, or revoke a public share link for drawings
// =============================================================================

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

// POST: Generate or update public share link for drawings
async function generateShareLinkHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { customerId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return errorResponse('Invalid customer ID', 400);
    }

    let customer = await CrmCustomer.findOne({ _id: customerId, organizationId });
    if (!customer) {
      customer = await CrmCustomer.findById(customerId);
    }
    if (!customer) {
      return errorResponse('Customer/Lead not found', 404);
    }

    const body = await req.json().catch(() => ({}));
    const {
      expiresDays = null,
      allowDownload = true,
      includeRequirements = true,
      regenerate = false,
    } = body;

    // Maintain existing token if valid and not asking for regenerate, else create new one
    let token = customer.shareSettings?.shareToken;
    if (!token || regenerate) {
      token = `cd_${crypto.randomBytes(16).toString('hex')}`;
    }

    const expiresAt = expiresDays ? new Date(Date.now() + Number(expiresDays) * 24 * 60 * 60 * 1000) : null;

    customer.shareSettings = {
      shareToken: token,
      isPublic: true,
      expiresAt,
      allowDownload: Boolean(allowDownload),
      includeRequirements: Boolean(includeRequirements),
      viewCount: customer.shareSettings?.viewCount || 0,
      lastViewedAt: customer.shareSettings?.lastViewedAt,
    };

    await customer.save();

    return successResponse({
      shareToken: token,
      shareSettings: customer.shareSettings,
      message: 'Share link generated successfully',
    });
  } catch (error) {
    console.error('Error generating drawing share link:', error);
    return serverErrorResponse('Failed to generate drawing share link');
  }
}

// DELETE: Revoke public share link
async function revokeShareLinkHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { customerId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return errorResponse('Invalid customer ID', 400);
    }

    let customer = await CrmCustomer.findOneAndUpdate(
      { _id: customerId, organizationId },
      {
        $set: {
          'shareSettings.isPublic': false,
        },
      },
      { new: true }
    );
    if (!customer) {
      customer = await CrmCustomer.findByIdAndUpdate(
        customerId,
        {
          $set: {
            'shareSettings.isPublic': false,
          },
        },
        { new: true }
      );
    }

    if (!customer) {
      return errorResponse('Customer/Lead not found', 404);
    }

    return successResponse({
      shareSettings: customer.shareSettings,
      message: 'Share link revoked successfully',
    });
  } catch (error) {
    console.error('Error revoking drawing share link:', error);
    return serverErrorResponse('Failed to revoke drawing share link');
  }
}

export const POST = withAuth(generateShareLinkHandler);
export const DELETE = withAuth(revokeShareLinkHandler);
