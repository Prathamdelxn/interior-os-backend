// =============================================================================
// InteriorOS Backend — Public Client Feedback / Rejection API
// Allows external clients to approve drawings or request changes with reasons
// =============================================================================

import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  try {
    await connectDB();
    const { token } = await context.params;

    if (!token) {
      return errorResponse('Missing share token', 400);
    }

    const customer = await CrmCustomer.findOne({
      'shareSettings.shareToken': token,
      'shareSettings.isPublic': true,
    });

    if (!customer) {
      return errorResponse('Drawing link is invalid or disabled', 404);
    }

    if (customer.shareSettings?.expiresAt && new Date() > new Date(customer.shareSettings.expiresAt)) {
      return errorResponse('This drawing share link has expired', 410);
    }

    const body = await req.json();
    const {
      drawingId, // Optional: if specific drawing, else overall project drawings
      action = 'client_changes_requested', // 'client_approved' | 'client_changes_requested'
      clientFeedback = '',
    } = body;

    if (action === 'client_changes_requested' && !clientFeedback.trim()) {
      return errorResponse('Please provide a reason or changes requested', 400);
    }

    if (drawingId) {
      const drawing = customer.designFiles.find((d: any) => d._id?.toString() === drawingId);
      if (drawing) {
        drawing.status = action;
        const currentVer = (drawing.versions || []).find((v: any) => v.versionNumber === drawing.currentVersion) 
          || (drawing.versions && drawing.versions[drawing.versions.length - 1]);
        if (currentVer) {
          currentVer.clientStatus = action;
          currentVer.clientFeedback = clientFeedback;
          currentVer.clientRespondedAt = new Date();
        }
      }
    } else {
      // Overall response on all approved drawings
      customer.designFiles.forEach((d: any) => {
        if (d.status === 'internally_approved' || d.status === 'client_changes_requested' || d.status === 'client_approved') {
          d.status = action;
          const currentVer = (d.versions || []).find((v: any) => v.versionNumber === d.currentVersion)
            || (d.versions && d.versions[d.versions.length - 1]);
          if (currentVer) {
            currentVer.clientStatus = action;
            currentVer.clientFeedback = clientFeedback;
            currentVer.clientRespondedAt = new Date();
          }
        }
      });
    }

    await customer.save();

    // Log Activity in CRM for team notification
    await CrmActivity.create({
      organizationId: customer.organizationId,
      customer: customer._id,
      type: '2D/3D Drawing',
      status: action === 'client_approved' ? 'Completed' : 'Pending',
      remarks: action === 'client_approved'
        ? `Client (${customer.name}) APPROVED drawings via client share portal!`
        : `Client (${customer.name}) REQUESTED CHANGES on drawings: "${clientFeedback}"`,
    }).catch(() => null);

    return successResponse({
      action,
      message: action === 'client_approved'
        ? 'Thank you! Your drawing approval has been submitted to the design team.'
        : 'Your feedback has been submitted. The design team will upload a revised version shortly.',
    });
  } catch (error) {
    console.error('Error submitting client drawing feedback:', error);
    return serverErrorResponse('Failed to submit feedback');
  }
}
