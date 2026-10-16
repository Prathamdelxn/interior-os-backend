import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withPermission } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Vendor } from '@/models/vendor.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

async function getVendorsHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    const vendors = await Vendor.find({ organizationId }).sort({ createdAt: -1 });

    return successResponse(vendors);
  } catch (error) {
    console.error('List vendors error:', error);
    return serverErrorResponse();
  }
}

async function createVendorHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    if (!body.name) {
      return errorResponse('Vendor name is required', 400);
    }

    const vendor = new Vendor({
      ...body,
      organizationId,
      status: body.status || 'Active',
    });

    await vendor.save();

    return createdResponse(vendor, 'Vendor created successfully');
  } catch (error: any) {
    console.error('Create vendor error:', error);
    return serverErrorResponse();
  }
}

export const GET = withPermission('vendors', 'read', getVendorsHandler);
export const POST = withPermission('vendors', 'create', createVendorHandler);
