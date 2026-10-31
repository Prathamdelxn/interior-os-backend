// =============================================================================
// InteriorOS Backend - Public Client Requirements Submission API
// Allows external clients to submit their room requirements & wishlist via share link
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
    });

    if (!customer) {
      return errorResponse('Requirement link is invalid or does not exist', 404);
    }

    if (customer.shareSettings?.isPublic === false) {
      return errorResponse('This requirement share link has been disabled or stopped', 403);
    }

    if (customer.shareSettings?.expiresAt && new Date() > new Date(customer.shareSettings.expiresAt)) {
      return errorResponse('This requirement share link has expired', 410);
    }

    const body = await req.json();
    const { requirements = [], notes = '', budgetRange = '' } = body;

    customer.clientRequirements = requirements;
    customer.clientRequirementsSubmittedAt = new Date();
    if (notes) {
      customer.clientRequirementsNotes = notes;
    }
    if (budgetRange) {
      customer.budgetRange = budgetRange;
    }

    await customer.save();

    // Log Activity in CRM for team notification
    // Activities need a user: the client has no account, so log it under the
    // lead's owner (sales executive → designer → creator)
    await CrmActivity.create({
      organizationId: customer.organizationId,
      customer: customer._id,
      user: customer.assignedSalesExecutive || customer.designerAssigned || customer.createdBy,
      type: 'Requirement Gathering',
      status: 'Completed',
      remarks: `Client (${customer.name}) submitted ${requirements.length} space requirement(s) via Client Portal.${notes ? ' Notes: "' + notes + '"' : ''}`,
      completedDate: new Date(),
    }).catch(() => null);

    return successResponse({
      message: 'Requirements submitted successfully! Your design team has been notified.',
      clientRequirements: customer.clientRequirements,
      clientRequirementsSubmittedAt: customer.clientRequirementsSubmittedAt,
      shareSettings: customer.shareSettings,
    });
  } catch (error) {
    console.error('Error submitting client requirements:', error);
    return serverErrorResponse('Failed to submit requirements');
  }
}
