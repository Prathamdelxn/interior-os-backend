// =============================================================================
// InteriorOS Backend — CRM Customer Detail API: PATCH
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';
import { z } from 'zod';

const updateCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .refine((val) => !/\d/.test(val), 'Full name cannot contain numbers')
    .refine((val) => /^[a-zA-Z\s'.-]+$/.test(val), 'Full name can only contain letters, spaces, hyphens, and dots')
    .optional(),
  mobileNumber: z
    .string()
    .trim()
    .refine((val) => {
      if (!val) return true;
      return !/[a-zA-Z]/.test(val);
    }, 'Mobile number cannot contain letters')
    .refine((val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 10 && digitsOnly.length <= 15;
    }, 'Please enter a valid mobile number (10 to 15 digits)')
    .optional(),
  email: z.string().trim().email('Please enter a valid email address').optional().or(z.literal('')),
  leadSource: z.string().optional(),
  propertyType: z.string().optional(),
  projectLocation: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  propertyAddress: z.string().optional(),
  budgetRange: z.string().optional(),
  status: z.string().optional(),
  assignedSalesExecutive: z.string().optional(),
  designerAssigned: z.string().optional(),
  priority: z.string().optional(),
  possessionDate: z.coerce.date().optional().nullable(),
  siteVisitScheduledDate: z.coerce.date().optional().nullable(),
  futureFollowUpDate: z.coerce.date().optional().nullable(),
  siteMeasurements: z.any().optional(),
  sitePhotos: z.array(z.string()).optional(),
  requirements: z.any().optional(),
  designs: z.array(z.any()).optional(),
  designFiles: z.array(z.any()).optional(),
  quotations: z.array(z.any()).optional(),
  boqs: z.array(z.any()).optional(),
  remarks: z.string().optional(),
  lostReason: z.string().optional(),
});

// PATCH: Update a Customer (e.g. Status change)
async function updateCustomerHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { customerId } = await context.params;
    const data = await req.json();

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return errorResponse('Invalid Customer ID', 400);
    }

    const validation = updateCustomerSchema.safeParse(data);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const existing = await CrmCustomer.findOne({ _id: customerId, organizationId });
    if (!existing) {
      return errorResponse('Customer not found', 404);
    }

    const updateData: any = { ...validation.data };
    const unsetData: any = {};

    // If lead has already been converted or won, preserve its status and project link, but permit updating site measurements, photos, requirements, remarks, etc.
    if (existing.status === 'Won' || existing.status === 'Converted' || existing.linkedProject) {
      if (updateData.status && updateData.status !== existing.status) {
        delete updateData.status;
      }
    }

    if (updateData.assignedSalesExecutive === '' || updateData.assignedSalesExecutive === null) {
      delete updateData.assignedSalesExecutive;
      unsetData.assignedSalesExecutive = 1;
    }
    if (updateData.designerAssigned === '' || updateData.designerAssigned === null) {
      delete updateData.designerAssigned;
      unsetData.designerAssigned = 1;
    }

    const updateQuery: any = { $set: updateData };
    if (Object.keys(unsetData).length > 0) {
      updateQuery.$unset = unsetData;
    }

    const customer = await CrmCustomer.findOneAndUpdate(
      { _id: customerId, organizationId },
      updateQuery,
      { new: true }
    );

    if (!customer) {
      return errorResponse('Customer not found', 404);
    }

    // If status was changed, log an activity automatically
    if (data.status) {
      await CrmActivity.create({
        customer: customer._id,
        user: auth.userId,
        organizationId,
        type: 'Status Change',
        status: 'Completed',
        remarks: `Lead moved to stage: ${data.status}`,
        completedDate: new Date(),
      });
    }

    return successResponse(customer, 'Customer updated successfully');
  } catch (error: any) {
    console.error('Update CRM customer error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return errorResponse(messages.join(', '), 400);
    }

    return serverErrorResponse();
  }
}

export const PATCH = withAuth(updateCustomerHandler);

// DELETE: Delete a Customer Lead
async function deleteCustomerHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { customerId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return errorResponse('Invalid Customer ID', 400);
    }

    const existing = await CrmCustomer.findOne({ _id: customerId, organizationId });
    if (!existing) {
      return errorResponse('Customer not found', 404);
    }

    if (existing.status === 'Won' || existing.status === 'Converted' || existing.linkedProject) {
      return errorResponse('This lead has already been converted to an active project and cannot be deleted.', 400);
    }

    const customer = await CrmCustomer.findOneAndDelete({ _id: customerId, organizationId });

    if (!customer) {
      return errorResponse('Customer not found', 404);
    }

    // Delete related activities
    await CrmActivity.deleteMany({ customer: customerId, organizationId });

    return successResponse(null, 'Customer lead deleted successfully');
  } catch (error: any) {
    console.error('Delete CRM customer error:', error);
    return serverErrorResponse();
  }
}

export const DELETE = withAuth(deleteCustomerHandler);
