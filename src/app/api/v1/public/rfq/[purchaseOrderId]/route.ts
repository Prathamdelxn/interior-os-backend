// =============================================================================
// InteriorOS Backend - Public RFQ Submission Route
// =============================================================================

import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { PurchaseOrder } from '@/models/purchase-order.model';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';

// GET: Retrieve public RFQ details for vendors
export async function GET(req: NextRequest, context: { params: Promise<Record<string, string>> }) {
  try {
    await connectDB();
    const { purchaseOrderId } = await context.params;

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, isDeleted: false, status: 'rfq' });
    if (!po) {
      return notFoundResponse('Quotation link is invalid or expired.');
    }

    // Return sanitized data for the vendor (hide other quotes, internal budget, etc.)
    const publicData = {
      _id: po._id,
      poNumber: po.poNumber,
      materialName: po.materialName,
      items: po.items,
      createdAt: po.createdAt,
    };

    return successResponse(publicData);
  } catch (error) {
    console.error('Get Public RFQ error:', error);
    return serverErrorResponse();
  }
}

// POST: Vendor submits a quotation
export async function POST(req: NextRequest, context: { params: Promise<Record<string, string>> }) {
  try {
    await connectDB();
    const { purchaseOrderId } = await context.params;
    const body = await req.json();

    const { vendorName, contactInfo, remarks, rates } = body;

    if (!vendorName || !contactInfo || !rates || rates.length === 0) {
      return errorResponse('Missing required quotation data', 400);
    }

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, isDeleted: false, status: 'rfq' });
    if (!po) {
      return notFoundResponse('Quotation link is invalid or expired.');
    }

    const newQuote = {
      vendorName,
      contactInfo,
      remarks,
      submittedAt: new Date(),
      rates
    };

    const updatedPo = await PurchaseOrder.findOneAndUpdate(
      { _id: purchaseOrderId },
      { $push: { quotes: newQuote } },
      { returnDocument: 'after' }
    );

    return successResponse(updatedPo, 'Quotation submitted successfully');
  } catch (error) {
    console.error('Submit Public RFQ error:', error);
    return serverErrorResponse();
  }
}
