// =============================================================================
// InteriorOS Backend — Change Request Approval API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { ChangeRequest, VariationOrder, Project, User } from '@/models';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// POST: Approve Change Request and generate Variation Order
async function approveCrHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId, crId } = await context.params;

    const changeRequest = await ChangeRequest.findOne({
      _id: crId,
      projectId,
      organizationId,
      isDeleted: false,
    });

    if (!changeRequest) {
      return notFoundResponse('Change request not found');
    }

    if (changeRequest.status === 'approved') {
      return errorResponse('Change request is already approved', 400);
    }

    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      return notFoundResponse('Associated project not found');
    }

    // 1. Mark Change Request as Approved
    changeRequest.status = 'approved';
    await changeRequest.save();

    // 2. Generate a sequential Variation Order Number
    const latestVo = await VariationOrder.findOne({ projectId, organizationId, isDeleted: { $in: [true, false] } })
      .sort({ createdAt: -1 })
      .select('voNumber')
      .lean();
    let nextNum = 1;
    if (latestVo?.voNumber) {
      const match = latestVo.voNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    let voNumber = `VO-${String(nextNum).padStart(5, '0')}`;
    let exists = await VariationOrder.findOne({ projectId, organizationId, voNumber, isDeleted: { $in: [true, false] } });
    while (exists) {
      nextNum++;
      voNumber = `VO-${String(nextNum).padStart(5, '0')}`;
      exists = await VariationOrder.findOne({ projectId, organizationId, voNumber, isDeleted: { $in: [true, false] } });
    }

    // 3. Map CR fields to VO configurations
    let voType: 'addition' | 'deletion' | 'replacement' | 'quantity_change' = 'addition';
    if (changeRequest.category === 'material') {
      voType = 'replacement';
    } else if (changeRequest.category === 'layout') {
      voType = 'quantity_change';
    } else if (changeRequest.description.toLowerCase().includes('remove') || changeRequest.description.toLowerCase().includes('delete')) {
      voType = 'deletion';
    }

    let voCategory: 'Civil' | 'Electrical' | 'Carpentry' | 'Furniture' | 'MEP' | 'Landscape' | 'Design' = 'Design';
    if (changeRequest.category === 'mep') voCategory = 'MEP';
    else if (changeRequest.category === 'material' || changeRequest.category === 'layout') voCategory = 'Carpentry';
    else if (changeRequest.category === 'scope') voCategory = 'Furniture';

    // Map impact breakdowns
    const cost = changeRequest.impactAssessment.costImpact || 0;
    const materialCost = Math.round(cost * 0.6);
    const laborCost = Math.round(cost * 0.3);
    const overheadCost = Math.round(cost * 0.1);
    const timelineImpactDays = changeRequest.impactAssessment.scheduleImpact || 0;

    // Copy drawings & renders to VO attachments
    const attachments: Array<{ name: string; url: string; type: 'photo' | 'drawing' | 'design_ref' | 'client_doc' }> = [];
    if (changeRequest.designReview) {
      (changeRequest.designReview.updatedDrawings || []).forEach(d => {
        attachments.push({ name: d.name, url: d.url, type: 'drawing' });
      });
      (changeRequest.designReview.threeDRenders || []).forEach(r => {
        attachments.push({ name: r.name, url: r.url, type: 'design_ref' });
      });
      (changeRequest.designReview.materialSamples || []).forEach(m => {
        attachments.push({ name: m.name, url: m.url, type: 'photo' });
      });
    }

    // 4. Create the Variation Order in 'submitted' (ready for PM / Commercial review)
    const variationOrder = new VariationOrder({
      voNumber,
      projectId,
      organizationId,
      client: project.client || 'Client',
      requestedBy: changeRequest.requestedBy,
      requestDate: new Date(),
      changeRequestId: changeRequest._id,
      type: voType,
      category: voCategory,
      status: 'submitted',
      description: `Variation Order generated from approved Change Request ${changeRequest.crNumber}: ${changeRequest.description}`,
      impactAnalysis: {
        materialCost,
        laborCost,
        vendorCost: 0,
        overheadCost,
        timelineImpactDays,
      },
      financialSummary: {
        originalCost: project.budget?.amount || 0,
        variationCost: cost,
        netDifference: cost,
        revisedProjectCost: (project.budget?.amount || 0) + cost,
      },
      attachments,
      billingGenerated: false,
    });

    await variationOrder.save();

    return successResponse(
      { changeRequest, variationOrder },
      'Change request approved and Variation Order generated successfully'
    );
  } catch (error) {
    console.error('Approve change request error:', error);
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('change_requests', 'approve', approveCrHandler);
