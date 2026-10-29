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

    const vendors: any[] = await Vendor.find({ organizationId }).sort({ createdAt: -1 }).lean();

    // Self-healing backfill: Ensure legacy vendors without a vendorCode get automatically assigned one
    const missingCodeVendors = vendors.filter((v) => !v.vendorCode);
    if (missingCodeVendors.length > 0) {
      let maxNum = 0;
      for (const v of vendors) {
        if (v.vendorCode) {
          const match = String(v.vendorCode).match(/^VND-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      }

      // Assign in chronological order
      const toBackfill = [...missingCodeVendors].reverse();
      for (const v of toBackfill) {
        maxNum++;
        const generatedCode = `VND-${String(maxNum).padStart(3, '0')}`;
        v.vendorCode = generatedCode;
        try {
          await Vendor.updateOne({ _id: v._id }, { $set: { vendorCode: generatedCode } });
        } catch (err) {
          console.warn('Vendor code backfill update error:', err);
        }
      }
    }

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

    // Determine or automatically generate unique vendorCode (VND-001, VND-002, ...)
    let vendorCode = typeof body.vendorCode === 'string' ? body.vendorCode.trim() : '';

    if (!vendorCode) {
      const existingVendorsWithCode = await Vendor.find({
        organizationId,
        vendorCode: { $regex: /^VND-\d+$/ },
      })
        .select('vendorCode')
        .lean();

      let maxNum = 0;
      for (const v of existingVendorsWithCode) {
        if (v.vendorCode) {
          const match = v.vendorCode.match(/^VND-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
      }

      let nextNum = maxNum + 1;
      vendorCode = `VND-${String(nextNum).padStart(3, '0')}`;
      while (await Vendor.findOne({ organizationId, vendorCode })) {
        nextNum++;
        vendorCode = `VND-${String(nextNum).padStart(3, '0')}`;
      }
    }

    const vendor = new Vendor({
      ...body,
      vendorCode,
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
