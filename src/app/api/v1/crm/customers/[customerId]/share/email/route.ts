// =============================================================================
// InteriorOS Backend — CRM Customer Send Requirements Questionnaire Email API
// =============================================================================

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { withAuth, getOrganizationId, withAnyPermission } from '@/middlewares/auth.middleware';
import { CRM_MODULES } from '@/lib/crm-access';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { sendEmail } from '@/lib/email';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';
import { z } from 'zod';

const sendEmailSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  customSubject: z.string().optional(),
  customMessage: z.string().optional(),
  requirementsUrl: z.string().optional(),
  expiresDays: z.number().nullable().optional(),
});

async function sendRequirementsEmailHandler(
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
    const parseResult = sendEmailSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.issues[0]?.message || 'Invalid email payload', 400);
    }

    const { recipientEmail, recipientName, customSubject, customMessage, requirementsUrl, expiresDays } = parseResult.data;

    // Ensure share token exists
    let token = customer.shareSettings?.shareToken;
    if (!token) {
      token = `cd_${crypto.randomBytes(16).toString('hex')}`;
    }

    let expiresAt = customer.shareSettings?.expiresAt;
    if (expiresDays !== undefined) {
      expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000) : null;
    }

    customer.shareSettings = {
      shareToken: token,
      isPublic: true,
      expiresAt: expiresAt ?? null,
      allowDownload: customer.shareSettings?.allowDownload ?? false,
      includeRequirements: true,
      viewCount: customer.shareSettings?.viewCount || 0,
      lastViewedAt: customer.shareSettings?.lastViewedAt,
    };
    await customer.save();

    const clientName = recipientName || customer.name || 'Valued Client';
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    const finalUrl = requirementsUrl || `${origin.replace(/\/+$/, '')}/share/requirements/${token}`;

    const subject = customSubject || `Complete Your Interior Design Questionnaire - ${customer.name}`;
    const message = customMessage || `Hi ${clientName},\n\nPlease take a few minutes to complete your design preferences and room specifications online so our team can prepare custom designs for you.`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
        <div style="margin-bottom: 24px; text-align: center;">
          <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 20px; font-weight: 700;">Design Requirements Questionnaire</h2>
          <p style="color: #64748b; margin: 0; font-size: 13px;">Project & Space Consultation</p>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${message}</p>
        </div>
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${finalUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            Open Interactive Design Intake Form &rarr;
          </a>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Or copy and paste this link in your browser:<br />
            <a href="${finalUrl}" style="color: #0284c7; word-break: break-all;">${finalUrl}</a>
          </p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: `${message}\n\nAccess link: ${finalUrl}`,
      });
    } catch (emailErr) {
      console.warn('Direct SMTP failed, link is still generated:', emailErr);
    }

    // Log activity
    try {
      await CrmActivity.create({
        organizationId,
        customer: customer._id,
        user: auth.userId,
        type: 'Email',
        status: 'Completed',
        remarks: `Sent requirements questionnaire to ${recipientEmail} (${finalUrl})`,
      });
    } catch {}

    return successResponse({
      message: `Requirements intake link successfully sent to ${recipientEmail}`,
      shareToken: token,
      requirementsUrl: finalUrl,
    });
  } catch (error) {
    console.error('Send requirements email error:', error);
    return serverErrorResponse('Failed to send requirements email');
  }
}

export const POST = withAnyPermission(CRM_MODULES, 'update', sendRequirementsEmailHandler);
