// =============================================================================
// InteriorOS Backend — Risks API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Risk } from '@/models/risk.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve all risks for the project
async function getRisksHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const risks = await Risk.find({ projectId, organizationId }).sort({ createdAt: -1 });
    return successResponse(risks);
  } catch (error) {
    console.error('Get risks error:', error);
    return serverErrorResponse();
  }
}

// POST: Add a new risk
async function createRiskHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { description, probability, impact } = body;
    if (!description || !probability || !impact) {
      return errorResponse('description, probability, and impact are required', 400);
    }

    const probScore = probability === 'high' ? 3 : probability === 'medium' ? 2 : 1;
    const impScore = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
    const score = probScore * impScore;

    const newRisk = new Risk({
      ...body,
      score,
      projectId,
      organizationId,
      owner: body.owner || auth.userId,
    });

    await newRisk.save();
    return createdResponse(newRisk, 'Risk logged successfully');
  } catch (error) {
    console.error('Create risk error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update a risk
async function updateRiskHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { riskId, description, category, probability, impact, mitigationPlan } = body;
    if (!riskId) {
      return errorResponse('riskId is required', 400);
    }

    const risk = await Risk.findOne({ _id: riskId, projectId, organizationId });
    if (!risk) {
      return notFoundResponse('Risk not found');
    }

    if (description) risk.description = description;
    if (category) risk.category = category;
    if (probability) risk.probability = probability;
    if (impact) risk.impact = impact;
    if (mitigationPlan !== undefined) risk.mitigationPlan = mitigationPlan;

    if (probability || impact) {
      const probScore = risk.probability === 'high' ? 3 : risk.probability === 'medium' ? 2 : 1;
      const impScore = risk.impact === 'high' ? 3 : risk.impact === 'medium' ? 2 : 1;
      risk.score = probScore * impScore;
    }

    await risk.save();
    return successResponse(risk, 'Risk updated successfully');
  } catch (error) {
    console.error('Update risk error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Remove a risk
async function deleteRiskHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    
    const searchParams = req.nextUrl.searchParams;
    const riskId = searchParams.get('riskId');

    if (!riskId) {
      return errorResponse('riskId is required', 400);
    }

    const risk = await Risk.findOneAndDelete({ _id: riskId, projectId, organizationId });
    if (!risk) {
      return notFoundResponse('Risk not found');
    }

    return successResponse(null, 'Risk deleted successfully');
  } catch (error) {
    console.error('Delete risk error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('risks', 'read', getRisksHandler);
export const POST = withProjectPermission('risks', 'create', createRiskHandler);
export const PUT = withProjectPermission('risks', 'update', updateRiskHandler);
export const DELETE = withProjectPermission('risks', 'delete', deleteRiskHandler);
