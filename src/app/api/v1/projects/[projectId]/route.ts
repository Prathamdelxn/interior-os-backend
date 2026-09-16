// =============================================================================
// InteriorOS Backend — Projects API: GET, PUT, DELETE by ID
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/project.model';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { calculateProjectMetrics } from '@/services/project-metrics.service';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';
const updateProjectSchema = z.object({
  name: z.string().trim().min(3, 'Project name must be at least 3 characters').max(100).optional(),
  client: z.string().trim().min(2, 'Client name must be at least 2 characters').max(100).optional(),
  type: z.enum(['Commercial Office', 'Residential', 'Tech Office', 'Co-working Space', 'General']).optional(),
  status: z.enum(['active', 'inactive', 'completed', 'on-hold']).optional(),
  startDate: z.string().transform((val) => new Date(val)).optional(),
  endDate: z.string().transform((val) => new Date(val)).optional(),
  budget: z.object({
    amount: z.number().nonnegative(),
    currency: z.string(),
  }).optional(),
  location: z.object({
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zipCode: z.string().optional(),
  }).optional(),
  description: z.string().optional(),
  threeDModelUrl: z.string().optional(),
});// GET: Get project details
async function getProjectDetailsHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const project = await Project.findOne({ _id: projectId, organizationId, isDeleted: false });
    if (!project) {
      return notFoundResponse('Project not found');
    }

    let budgetObj = project.budget || { amount: 0, currency: 'INR' };
    if (!budgetObj.amount || budgetObj.amount === 0) {
      const c = await CrmCustomer.findOne({ organizationId, linkedProject: projectId }).select('quotations boqs budgetRange').lean();
      if (c) {
        let bAmount = 0;
        if (c.quotations && c.quotations.length > 0) {
          const accepted: any = c.quotations.find((q: any) => q.status === 'Accepted' || q.status === 'Approved') || c.quotations[c.quotations.length - 1];
          bAmount = Number(accepted?.grandTotal || accepted?.totalAmount || accepted?.subtotal || accepted?.total || 0);
        }
        if (!bAmount && c.boqs && c.boqs.length > 0) {
          bAmount = Number(c.boqs[c.boqs.length - 1]?.totalAmount || 0);
        }
        if (!bAmount && c.budgetRange) {
          const cleaned = String(c.budgetRange).replace(/[^0-9.]/g, '');
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && parsed > 0) bAmount = parsed;
        }
        if (bAmount > 0) {
          budgetObj = { ...budgetObj, amount: bAmount };
          Project.updateOne({ _id: projectId }, { $set: { 'budget.amount': bAmount } }).catch(() => {});
        }
      }
    }

    const metrics = await calculateProjectMetrics(projectId, organizationId, project);
    const enrichedProject = {
      ...project.toJSON(),
      budget: budgetObj,
      progress: metrics.progress,
      health: metrics.health,
      healthColor: metrics.healthColor,
      healthLabel: metrics.healthLabel,
    };

    return successResponse(enrichedProject);
  } catch (error) {
    console.error('Get project details error:', error);
    return serverErrorResponse();
  }
}

// PUT: Update project
async function updateProjectHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = updateProjectSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const project = await Project.findOneAndUpdate(
      { _id: projectId, organizationId, isDeleted: false },
      { $set: validation.data },
      { returnDocument: 'after' }
    );

    if (!project) {
      return notFoundResponse('Project not found');
    }

    return successResponse(project, 'Project updated successfully');
  } catch (error) {
    console.error('Update project error:', error);
    return serverErrorResponse();
  }
}

// DELETE: Soft delete project
async function deleteProjectHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const project = await Project.findOneAndUpdate(
      { _id: projectId, organizationId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!project) {
      return notFoundResponse('Project not found');
    }

    // Unlock any CRM Lead / Customer linked to this project
    const linkedCustomers = await CrmCustomer.find({
      organizationId,
      linkedProject: projectId,
    });

    for (const customer of linkedCustomers) {
      customer.linkedProject = undefined;
      // Revert status to pre-conversion
      if (customer.status === 'Won' || customer.status === 'Converted') {
        const hasAcceptedQuote = customer.quotations?.some((q: any) => q.status === 'Accepted');
        customer.status = hasAcceptedQuote
          ? 'Booking Pending'
          : (customer.quotations && customer.quotations.length > 0
            ? 'Under Quotation'
            : (customer.boqs && customer.boqs.length > 0
              ? 'Under BOQ Creation'
              : (customer.designFiles && customer.designFiles.length > 0
                ? 'Under Drawing'
                : 'Under Requirement')));
      }
      await customer.save();

      // Log CRM Activity
      try {
        await CrmActivity.create({
          organizationId,
          customer: customer._id,
          user: auth.userId,
          type: 'Status Change',
          status: 'Completed',
          remarks: `Linked Project "${project.name}" (${project.code || ''}) was deleted. Lead is now unlocked for editing.`,
        });
      } catch (actErr) {
        console.warn('Failed to log CRM activity on project delete:', actErr);
      }
    }

    return successResponse(null, 'Project deleted successfully and linked leads unlocked');
  } catch (error) {
    console.error('Delete project error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('projects', 'read', getProjectDetailsHandler);
export const PUT = withProjectPermission('projects', 'update', updateProjectHandler);
export const DELETE = withProjectPermission('projects', 'delete', deleteProjectHandler);
