// =============================================================================
// InteriorOS Backend — SuperAdmin API: Template (Get / Update / Delete)
// =============================================================================

import { NextRequest } from 'next/server';
import { withSuperAdmin } from '@/middlewares/superadmin.middleware';
import { connectDB } from '@/lib/db';
import { ProjectTemplate } from '@/models/project-template.model';
import {
  successResponse,
  notFoundResponse,
  validationErrorResponse,
  serverErrorResponse,
} from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

/**
 * GET /api/v1/superadmin/templates/[templateId] — Retrieve template details
 */
export const GET = withSuperAdmin(
  async (_req: NextRequest, context: { params: Promise<Record<string, string>> }, _auth: JwtPayload) => {
    try {
      await connectDB();
      const { templateId } = await context.params;

      const template = await ProjectTemplate.findById(templateId).lean();
      if (!template) {
        return notFoundResponse('Template not found');
      }

      return successResponse({ template }, 'Template details retrieved successfully');
    } catch (error) {
      console.error('Get template error:', error);
      return serverErrorResponse();
    }
  }
);

/**
 * PUT /api/v1/superadmin/templates/[templateId] — Update template details
 */
export const PUT = withSuperAdmin(
  async (req: NextRequest, context: { params: Promise<Record<string, string>> }, _auth: JwtPayload) => {
    try {
      await connectDB();
      const { templateId } = await context.params;
      const body = await req.json();

      const template = await ProjectTemplate.findById(templateId);
      if (!template) {
        return notFoundResponse('Template not found');
      }

      // Check if name is changing and is duplicate
      if (body.name && body.name !== template.name) {
        const duplicate = await ProjectTemplate.findOne({ name: body.name });
        if (duplicate) {
          return validationErrorResponse([
            { field: 'name', message: 'A template with this name already exists' },
          ]);
        }
      }

      // Update fields
      if (body.name) template.name = body.name;
      if (body.category) template.category = body.category;
      if (body.description) template.description = body.description;
      if (body.wbs !== undefined) template.wbs = body.wbs;
      if (body.milestones !== undefined) template.milestones = body.milestones;
      if (body.procurement !== undefined) template.procurement = body.procurement;

      await template.save();

      return successResponse({ template }, 'Template updated successfully');
    } catch (error) {
      console.error('Update template error:', error);
      return serverErrorResponse();
    }
  }
);

/**
 * DELETE /api/v1/superadmin/templates/[templateId] — Soft delete template
 */
export const DELETE = withSuperAdmin(
  async (_req: NextRequest, context: { params: Promise<Record<string, string>> }, _auth: JwtPayload) => {
    try {
      await connectDB();
      const { templateId } = await context.params;

      const template = await ProjectTemplate.findByIdAndUpdate(
        templateId,
        { $set: { isDeleted: true, deletedAt: new Date() } },
        { returnDocument: 'after' }
      );

      if (!template) {
        return notFoundResponse('Template not found');
      }

      return successResponse(null, 'Template deleted successfully');
    } catch (error) {
      console.error('Delete template error:', error);
      return serverErrorResponse();
    }
  }
);
