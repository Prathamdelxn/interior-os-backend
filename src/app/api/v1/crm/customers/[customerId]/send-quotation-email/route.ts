// =============================================================================
// InteriorOS Backend — CRM Customer Send Quotation / Proforma Invoice Email API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { CrmActivity } from '@/models/crm-activity.model';
import { sendEmail, quotationInvoiceEmailTemplate } from '@/lib/email';
import { generateQuotationPdfBuffer } from '@/lib/pdf-generator';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';
import { z } from 'zod';

const sendQuotationEmailSchema = z.object({
  quotation: z.object({
    version: z.number().optional().default(1),
    quotationNumber: z.string().optional(),
    title: z.string().optional(),
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
  recipientType: z.enum(['customer', 'vendor', 'other']).optional().default('customer'),
  recipientName: z.string().trim().optional().or(z.literal('')),
  customSubject: z.string().trim().optional().or(z.literal('')),
  customMessage: z.string().trim().optional().or(z.literal('')),
  quotationIndex: z.number().optional(),
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

    const {
      quotation,
      recipientType = 'customer',
      recipientName,
      customSubject,
      customMessage,
      quotationIndex,
    } = validation.data;

    const targetEmail = (validation.data.recipientEmail || (recipientType === 'customer' ? customer.email : '') || '').trim();
    if (!targetEmail) {
      return errorResponse(
        recipientType === 'customer'
          ? 'Lead does not have an email address specified. Please provide a valid email.'
          : 'Please provide a valid recipient email address.',
        400
      );
    }

    const qtnLabel = quotation.quotationNumber || `Quotation v${quotation.version}`;
    const emailHtml = quotationInvoiceEmailTemplate(customer.name, quotation as any, 'SkyStruct Interior', {
      customMessage,
      recipientName,
      recipientType,
    });

    let subject = customSubject?.trim();
    if (!subject) {
      if (recipientType === 'vendor') {
        subject = `Quotation Reference (${qtnLabel}) - ${customer.name}`;
      } else if (recipientType === 'other') {
        subject = `Quotation (${qtnLabel}) - ${customer.name}`;
      } else {
        subject = `Commercial Quotation (${qtnLabel}) for ${customer.name}`;
      }
    }

    // Generate official standalone printable PDF attachment
    const pdfBuffer = await generateQuotationPdfBuffer(customer.name, quotation as any, {
      companyName: 'SkyStruct Interior',
      recipientName,
      recipientType,
      customMessage,
    });

    const pdfFilename = `${qtnLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    // Send email via nodemailer with formatted body and attached PDF document
    await sendEmail({
      to: targetEmail,
      subject,
      html: emailHtml,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    // If sent to customer for approval, update status of that quotation in the customer's quotations array
    let updatedCustomer = customer;
    if (recipientType === 'customer' && Array.isArray(customer.quotations)) {
      let targetIdx = typeof quotationIndex === 'number' && quotationIndex >= 0 && quotationIndex < customer.quotations.length
        ? quotationIndex
        : customer.quotations.findIndex((q: any) => q.version === quotation.version || q.quotationNumber === quotation.quotationNumber);

      if (targetIdx !== -1 && customer.quotations[targetIdx]) {
        customer.quotations[targetIdx].status = 'Sent';
        customer.quotations[targetIdx].updatedAt = new Date();
        customer.markModified('quotations');
        await customer.save();
      }
    }

    // Record activity with appropriate description
    let activityRemark = '';
    if (recipientType === 'vendor') {
      activityRemark = `Sent Quotation ${qtnLabel} copy to Vendor ${recipientName ? `"${recipientName}" ` : ''}(${targetEmail})${customMessage ? ` with note: "${customMessage.slice(0, 80)}..."` : ''}`;
    } else if (recipientType === 'other') {
      activityRemark = `Sent Quotation ${qtnLabel} to ${recipientName ? `"${recipientName}" ` : ''}(${targetEmail})${customMessage ? ` with note: "${customMessage.slice(0, 80)}..."` : ''}`;
    } else {
      activityRemark = `Emailed Quotation ${qtnLabel} (₹${(Number(quotation.grandTotal) || 0).toLocaleString('en-IN')}) to client ${targetEmail} for approval`;
    }

    await CrmActivity.create({
      customer: customer._id,
      user: auth.userId,
      organizationId,
      type: 'Email',
      status: 'Completed',
      remarks: activityRemark,
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
        description: activityRemark,
        metadata: {
          quotationNumber: qtnLabel,
          amount: quotation.grandTotal,
          recipientEmail: targetEmail,
          recipientType,
          recipientName,
          customerName: customer.name,
        },
        req,
      }).catch(() => {});
    } catch {}

    return successResponse(
      { emailedTo: targetEmail, recipientType, status: 'Sent' },
      recipientType === 'customer'
        ? `Quotation sent successfully to customer (${targetEmail}) for approval.`
        : `Quotation sent successfully to ${recipientName || targetEmail}.`
    );
  } catch (error: any) {
    console.error('Send Quotation Email error:', error);
    return errorResponse(error.message || 'Failed to send quotation email. Please verify SMTP settings.', 500);
  }
}

export const POST = withAuth(sendQuotationEmailHandler);
