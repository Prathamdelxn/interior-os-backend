import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withPermission } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Vendor } from '@/models/vendor.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

// GET /api/v1/vendors/[vendorId]
async function getVendorHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { vendorId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return errorResponse('Invalid vendor ID', 400);
    }

    const vendor = await Vendor.findOne({ _id: vendorId, organizationId });
    if (!vendor) {
      return notFoundResponse('Vendor not found');
    }

    return successResponse(vendor);
  } catch (error) {
    console.error('Get vendor error:', error);
    return serverErrorResponse();
  }
}

// PATCH /api/v1/vendors/[vendorId]
async function updateVendorHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { vendorId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return errorResponse('Invalid vendor ID', 400);
    }

    const body = await req.json();

    const vendor = await Vendor.findOne({ _id: vendorId, organizationId });
    if (!vendor) {
      return notFoundResponse('Vendor not found');
    }

    if (body.name !== undefined) vendor.name = body.name.trim();
    if (body.contactPerson !== undefined) vendor.contactPerson = body.contactPerson.trim();
    if (body.email !== undefined) vendor.email = body.email.trim();
    if (body.phoneNumber !== undefined) vendor.phoneNumber = body.phoneNumber.trim();
    if (body.gstNumber !== undefined) vendor.gstNumber = body.gstNumber.trim();
    if (body.vendorCategory !== undefined) vendor.vendorCategory = body.vendorCategory;
    if (body.address !== undefined) vendor.address = body.address.trim();
    if (body.paymentTerms !== undefined) vendor.paymentTerms = body.paymentTerms;
    if (body.status !== undefined) vendor.status = body.status;
    if (body.bankDetails !== undefined) {
      vendor.bankDetails = {
        accountName: body.bankDetails.accountName || '',
        accountNumber: body.bankDetails.accountNumber || '',
        ifscCode: body.bankDetails.ifscCode || '',
        bankName: body.bankDetails.bankName || '',
      };
    }

    await vendor.save();

    return successResponse(vendor, 'Vendor updated successfully');
  } catch (error: any) {
    console.error('Update vendor error:', error);
    return serverErrorResponse();
  }
}

// DELETE /api/v1/vendors/[vendorId]
async function deleteVendorHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { vendorId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return errorResponse('Invalid vendor ID', 400);
    }

    const vendor = await Vendor.findOneAndDelete({ _id: vendorId, organizationId });
    if (!vendor) {
      return notFoundResponse('Vendor not found');
    }

    return successResponse({ deletedVendorId: vendorId }, 'Vendor deleted successfully');
  } catch (error) {
    console.error('Delete vendor error:', error);
    return serverErrorResponse();
  }
}

export const GET = withPermission('vendors', 'read', getVendorHandler);
export const PATCH = withPermission('vendors', 'update', updateVendorHandler);
export const PUT = withPermission('vendors', 'update', updateVendorHandler);
export const DELETE = withPermission('vendors', 'delete', deleteVendorHandler);
