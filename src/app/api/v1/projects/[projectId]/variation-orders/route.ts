// =============================================================================
// InteriorOS Backend — Variation Orders API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { VariationOrder, Project, User } from '@/models';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const createVoSchema = z.object({
  type: z.enum(['addition', 'deletion', 'replacement', 'quantity_change']),
  category: z.enum(['Civil', 'Electrical', 'Carpentry', 'Furniture', 'MEP', 'Landscape', 'Design']),
  description: z.string().min(1, 'Description is required'),
  impactAnalysis: z.object({
    materialCost: z.number().min(0),
    laborCost: z.number().min(0),
    vendorCost: z.number().min(0),
    overheadCost: z.number().min(0),
    timelineImpactDays: z.number(),
  }),
  financialSummary: z.object({
    originalCost: z.number().min(0),
    variationCost: z.number(),
    netDifference: z.number(),
    revisedProjectCost: z.number().min(0),
  }),
});

// GET: Retrieve all variation orders
async function listVariationOrdersHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const variationOrders = await VariationOrder.find({
      projectId,
      organizationId,
      isDeleted: false,
    })
      .populate('requestedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    return successResponse(variationOrders);
  } catch (error) {
    console.error('List variation orders error:', error);
    return serverErrorResponse();
  }
}

// POST: Manually create a variation order
async function createVariationOrderHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = createVoSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { type, category, description, impactAnalysis, financialSummary } = validation.data;

    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      return notFoundResponse('Project not found');
    }

    // Generate sequential VO number
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

    const newVo = new VariationOrder({
      voNumber,
      projectId,
      organizationId,
      client: project.client || 'Client',
      requestedBy: auth.userId,
      requestDate: new Date(),
      type,
      category,
      status: 'draft',
      description,
      impactAnalysis,
      financialSummary: {
        originalCost: project.budget?.amount || 0,
        variationCost: financialSummary.variationCost,
        netDifference: financialSummary.netDifference,
        revisedProjectCost: (project.budget?.amount || 0) + financialSummary.netDifference,
      },
      attachments: [],
      billingGenerated: false,
    });

    await newVo.save();

    const populatedVo = await VariationOrder.findById(newVo._id).populate('requestedBy', 'firstName lastName email');
    return createdResponse(populatedVo, 'Variation order created successfully');
  } catch (error) {
    console.error('Create variation order error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('variation_orders', 'read', listVariationOrdersHandler);
export const POST = withProjectPermission('variation_orders', 'create', createVariationOrderHandler);
