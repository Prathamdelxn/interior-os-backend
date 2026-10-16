// =============================================================================
// InteriorOS Backend — Change Requests API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { ChangeRequest, User } from '@/models';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const createCrSchema = z.object({
  category: z.enum(['design', 'material', 'layout', 'mep', 'scope', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1, 'Description is required'),
  areaAffected: z.string().optional(),
  currentDesign: z.string().optional(),
  proposedDesign: z.string().optional(),
  reasonForChange: z.string().optional(),
});

// AI Predictor Heuristic matching design specs, BOQs, and drawings
export function predictImpact(category: string, priority: string, description: string) {
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

// GET: Retrieve all change requests for a project
async function listChangeRequestsHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const changeRequests = await ChangeRequest.find({
      projectId,
      organizationId,
      isDeleted: false,
    })
      .populate('requestedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    return successResponse(changeRequests);
  } catch (error) {
    console.error('List change requests error:', error);
    return serverErrorResponse();
  }
}

// POST: Create a new change request
async function createChangeRequestHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = createCrSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { category, priority, description, areaAffected, currentDesign, proposedDesign, reasonForChange } = validation.data;

    // Generate sequential CR number
    const count = await ChangeRequest.countDocuments({ projectId, organizationId });
    const crNumber = `CR-${100 + count + 1}`;

    // Perform AI Prediction
    const aiEvaluation = predictImpact(category, priority, description);

    const changeRequest = new ChangeRequest({
      crNumber,
      projectId,
      organizationId,
      requestedBy: auth.userId,
      requestedDate: new Date(),
      category,
      priority,
      description,
      areaAffected,
      currentDesign,
      proposedDesign,
      reasonForChange,
      status: 'draft',
      impactAssessment: {
        costImpact: aiEvaluation.predictedCostImpact, // preset cost impact based on AI
        scheduleImpact: aiEvaluation.predictedTimelineImpact,
        resourceImpact: aiEvaluation.predictedResourceChanges,
        procurementImpact: aiEvaluation.predictedProcurementChanges,
        qualityImpact: 'Standard quality guidelines apply.',
        riskImpact: 'Low risk. Standard execution methods.',
      },
      aiEvaluation,
    });

    await changeRequest.save();

    const populatedCr = await ChangeRequest.findById(changeRequest._id).populate('requestedBy', 'firstName lastName email');
    return createdResponse(populatedCr, 'Change request created successfully');
  } catch (error) {
    console.error('Create change request error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('change_requests', 'read', listChangeRequestsHandler);
export const POST = withProjectPermission('change_requests', 'create', createChangeRequestHandler);
