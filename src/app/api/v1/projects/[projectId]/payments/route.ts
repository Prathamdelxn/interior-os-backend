// =============================================================================
// InteriorOS Backend — Payments API: List & Create
// Handles: Incoming (client receipts), Outgoing (vendor payouts), Debit Notes
// =============================================================================

import { NextRequest } from 'next/server';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { Payment } from '@/models/payment.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { getOrganizationId } from '@/middlewares/auth.middleware';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------
const incomingSchema = z.object({
  type: z.literal('incoming'),
  invoiceNo: z.string().optional(),
  projectName: z.string().optional(),
  projectLocation: z.string().optional(),
  milestoneName: z.string().min(1, 'Milestone name is required'),
  amount: z.number().positive('Amount must be positive'),
  paymentDate: z.string().transform((v) => new Date(v)),
  paymentMethod: z.enum(['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'RTGS/NEFT']),
  referenceNo: z.string().min(1, 'Reference / UTR is required'),
  remarks: z.string().optional().default(''),
});

const outgoingSchema = z.object({
  type: z.literal('outgoing'),
  poNo: z.string().optional(),
  invoiceNo: z.string().optional(),
  projectName: z.string().optional(),
  projectLocation: z.string().optional(),
  vendorName: z.string().min(1, 'Vendor name is required'),
  category: z.string().min(1, 'Category is required'),
  amount: z.number().positive('Amount must be positive'),
  paymentDate: z.string().transform((v) => new Date(v)),
  paymentMethod: z.enum(['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'RTGS/NEFT']),
  referenceNo: z.string().min(1, 'Reference / UTR is required'),
  remarks: z.string().optional().default(''),
});

const debitNoteSchema = z.object({
  type: z.literal('debit_note'),
  debitNoteNo: z.string().optional(),
  invoiceNo: z.string().optional(),
  projectName: z.string().optional(),
  projectLocation: z.string().optional(),
  vendorName: z.string().min(1, 'Vendor name is required'),
  reason: z.string().min(1, 'Reason is required'),
  amount: z.number().positive('Amount must be positive'),
  issueDate: z.string().transform((v) => new Date(v)),
  remarks: z.string().optional().default(''),
});

const createPaymentSchema = z.discriminatedUnion('type', [incomingSchema, outgoingSchema, debitNoteSchema]);

// ---------------------------------------------------------------------------
// Auto-generate reference numbers
// ---------------------------------------------------------------------------
function generateRef(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${year}-${rand}`;
}

// ---------------------------------------------------------------------------
// GET: List payments for a project (optionally filter by type)
// ---------------------------------------------------------------------------
async function listPaymentsHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'incoming' | 'outgoing' | 'debit_note' | null (all)

    const query: Record<string, unknown> = { projectId, organizationId, isDeleted: false };
    if (type && ['incoming', 'outgoing', 'debit_note'].includes(type)) {
      query.type = type;
    }

    const payments = await Payment.find(query)
      .populate('recordedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    return successResponse(payments);
  } catch (error) {
    console.error('List payments error:', error);
    return serverErrorResponse();
  }
}

// ---------------------------------------------------------------------------
// POST: Create a payment record (incoming / outgoing / debit_note)
// ---------------------------------------------------------------------------
async function createPaymentHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = createPaymentSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const data = validation.data;
    const paymentData: Record<string, unknown> = {
      ...data,
      projectId,
      organizationId,
      recordedBy: auth.userId,
    };

    // Assign auto-generated reference numbers if missing
    if (data.type === 'incoming' && !data.invoiceNo) {
      paymentData.invoiceNo = generateRef('INV');
    }
    if (data.type === 'outgoing' && !data.poNo) {
      paymentData.poNo = generateRef('PO');
    }
    if (data.type === 'debit_note' && !data.debitNoteNo) {
      paymentData.debitNoteNo = generateRef('DN');
    }

    // Set default statuses
    if (data.type === 'incoming') {
      paymentData.incomingStatus = 'Completed';
    } else if (data.type === 'outgoing') {
      paymentData.outgoingStatus = 'Paid';
    } else if (data.type === 'debit_note') {
      paymentData.debitNoteStatus = 'Issued';
    }

    const payment = new Payment(paymentData);
    await payment.save();

    return createdResponse(payment, 'Payment recorded successfully');
  } catch (error) {
    console.error('Create payment error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('financials', 'read', listPaymentsHandler);
export const POST = withProjectPermission('financials', 'create', createPaymentHandler);
