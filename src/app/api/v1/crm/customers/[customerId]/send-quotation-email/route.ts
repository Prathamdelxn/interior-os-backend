// =============================================================================
// InteriorOS Backend — CRM Customer Send Quotation / Proforma Invoice Email API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { sendEmail, quotationInvoiceEmailTemplate } from '@/lib/email';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';
import { z } from 'zod';

const sendQuotationEmailSchema = z.object({
  quotation: z.object({
    version: z.number().optional().default(1),
    quotationNumber: z.string().optional(),
    items: z.array(
      z.object({
        description: z.string().optional(),
        itemName: z.string().optional(),
        name: z.string().optional(),
        quantity: z.any().optional(),
        unitPrice: z.any().optional(),
        rate: z.any().optional(),
        total: z.any().optional(),
        amount: z.any().optional(),
      }).passthrough()
    ).optional().default([]),
    subtotal: z.any().optional().default(0),
    taxPercentage: z.any().optional().default(0),
    tax: z.any().optional().default(0),
    discount: z.any().optional().default(0),
    grandTotal: z.any().optional().default(0),
    notes: z.string().optional().nullable(),
  }).passthrough(),
  recipientEmail: z.string().trim().optional().or(z.literal('')),
});

async function sendQuotationEmailHandler(
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

    const body = await req.json();
    const validation = sendQuotationEmailSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const customer = await CrmCustomer.findOne({ _id: customerId, organizationId });
    if (!customer) {
      return errorResponse('Customer not found', 404);
    }

    const targetEmail = (validation.data.recipientEmail || customer.email || '').trim();
    if (!targetEmail) {
      return errorResponse('Lead does not have an email address specified. Please provide a valid email.', 400);
    }

    const { quotation } = validation.data;
    const qtnLabel = quotation.quotationNumber || `Quotation v${quotation.version}`;
    const emailHtml = quotationInvoiceEmailTemplate(customer.name, quotation as any, 'InteriorOS');

    // Send email via nodemailer
    await sendEmail({
      to: targetEmail,
      subject: `Proforma Invoice & Quotation (${qtnLabel}) for ${customer.name}`,
      html: emailHtml,
    });

    // Record activity
    await CrmActivity.create({
      customer: customer._id,
      user: auth.userId,
      organizationId,
      type: 'Email',
      status: 'Completed',
      remarks: `Emailed Proforma Invoice & ${qtnLabel} (₹${(Number(quotation.grandTotal) || 0).toLocaleString('en-IN')}) to ${targetEmail}`,
      completedDate: new Date(),
    });

    try {
      const { logAuditEvent } = await import('@/services/audit.service');
      logAuditEvent({
        organizationId,
        userId: auth.userId,
        action: 'export',
        entity: 'Quotation',
        entityId: customer._id,
        entityName: `${customer.name} - ${qtnLabel}`,
        description: `Emailed official Proforma Invoice & Quotation (${qtnLabel}) to recipient ${targetEmail} (Total: ₹${(Number(quotation.grandTotal) || 0).toLocaleString('en-IN')})`,
        metadata: {
          quotationNumber: qtnLabel,
          amount: quotation.grandTotal,
          recipientEmail: targetEmail,
          customerName: customer.name,
        },
        req,
      }).catch(() => {});
    } catch {}

    return successResponse(
      { emailedTo: targetEmail },
      `Proforma Invoice & Quotation sent successfully to ${targetEmail}`
    );
  } catch (error: any) {
    console.error('Send Quotation Email error:', error);
    return errorResponse(error.message || 'Failed to send quotation email. Please verify SMTP settings.', 500);
  }
}

export const POST = withAuth(sendQuotationEmailHandler);
