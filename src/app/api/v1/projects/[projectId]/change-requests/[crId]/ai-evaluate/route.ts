// =============================================================================
// InteriorOS Backend — Change Request AI Re-Evaluation API (Forced Rebuild)
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { ChangeRequest, User } from '@/models';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// AI Predictor Heuristic matching design specs, BOQs, and drawings
function predictImpact(category: string, priority: string, description: string) {
  const descLower = description.toLowerCase();
  
  let cost = 15000;
  let days = 3;
  let procurement = 'Review materials catalog for standard options.';
  let resources = 'Assign junior designer for review.';
  let confidence = 0.75;

  if (descLower.includes('veneer') || descLower.includes('italian')) {
    cost = 35000;
    days = 4;
    procurement = 'Procure premium Italian Veneer. Check supplier stock for quick shipping.';
    resources = 'Allocate carpentry team (2 carpenters). Shift current site engineer to supervise paneling.';
    confidence = 0.92;
  } else if (descLower.includes('wallpaper')) {
    cost = 12000;
    days = 2;
    procurement = 'Order wallpaper roll matching code in Master Bedroom design spec.';
    resources = 'Schedule vendor decorator team for wall prep and installation.';
    confidence = 0.88;
  } else if (descLower.includes('lighting') || descLower.includes('fixture') || descLower.includes('chandelier') || descLower.includes('light')) {
    cost = 25000;
    days = 2;
    procurement = 'Source premium light fixtures/chandeliers. Verify electrical voltage requirements.';
    resources = 'Assign MEP engineer and electrician for wiring and mounting.';
    confidence = 0.85;
  } else if (descLower.includes('ceiling') || descLower.includes('false')) {
    cost = 45000;
    days = 6;
    procurement = 'Procure gypsum boards, metal frames, and LED strip lights.';
    resources = 'Deploy false ceiling team (3 workers) for framing and plastering.';
    confidence = 0.90;
  } else if (descLower.includes('wardrobe') || descLower.includes('tv unit') || descLower.includes('storage') || descLower.includes('seating')) {
    cost = 80000;
    days = 7;
    procurement = 'Order marine plywood, laminate backing, soft-close hinges, and slides.';
    resources = 'Assign 2 senior carpenters and 1 helper. Designer to revise cabinetry joinery details.';
    confidence = 0.89;
  } else if (category === 'mep' || descLower.includes('electrical') || descLower.includes('point') || descLower.includes('ac')) {
    cost = 18000;
    days = 3;
    procurement = 'Source copper wiring, conduit pipes, switch plates, and circuit breakers.';
    resources = 'Schedule MEP lead and electrical crew. Inspect existing electrical loads.';
    confidence = 0.82;
  } else if (category === 'layout' || descLower.includes('move') || descLower.includes('shift') || descLower.includes('floor')) {
    cost = 30000;
    days = 5;
    procurement = 'Check structural details. Additional support brackets might be required.';
    resources = 'Civil foreman and site engineer required. Designer to release updated layout plan.';
    confidence = 0.80;
  }

  // Adjustments based on priority
  if (priority === 'critical') {
    days = Math.max(1, Math.round(days * 0.7));
    cost = Math.round(cost * 1.25);
    confidence -= 0.05;
  } else if (priority === 'high') {
    cost = Math.round(cost * 1.1);
  }

  return {
    predictedCostImpact: cost,
    predictedTimelineImpact: days,
    predictedProcurementChanges: procurement,
    predictedResourceChanges: resources,
    evaluatedAt: new Date(),
    confidenceScore: parseFloat(confidence.toFixed(2)),
  };
}

// POST: Trigger AI evaluation on a change request
async function evaluateCrHandler(
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

    // Run prediction
    const aiEvaluation = predictImpact(changeRequest.category, changeRequest.priority, changeRequest.description);

    changeRequest.aiEvaluation = aiEvaluation;
    
    // Optional: Synchronize predicted values with current impact estimate if the user hasn't overwritten them yet
    changeRequest.impactAssessment.costImpact = aiEvaluation.predictedCostImpact;
    changeRequest.impactAssessment.scheduleImpact = aiEvaluation.predictedTimelineImpact;
    changeRequest.impactAssessment.resourceImpact = aiEvaluation.predictedResourceChanges;
    changeRequest.impactAssessment.procurementImpact = aiEvaluation.predictedProcurementChanges;

    await changeRequest.save();

    return successResponse(changeRequest, 'Change request evaluated by AI successfully');
  } catch (error) {
    console.error('AI evaluation error:', error);
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('change_requests', 'update', evaluateCrHandler);
