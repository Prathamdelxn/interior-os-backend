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
    const rawParams = context?.params ? await context.params : {};
    const customerId = rawParams.customerId || rawParams.id;

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return errorResponse('Invalid Customer ID', 400);
    }

    const body = await req.json();
    const validation = sendQuotationEmailSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    let customer = await CrmCustomer.findOne({ _id: customerId, organizationId });
    if (!customer) {
      customer = await CrmCustomer.findById(customerId);
    }
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
    let pdfBuffer: Buffer | undefined;
    try {
      pdfBuffer = await generateQuotationPdfBuffer(customer.name, quotation as any, {
        companyName: 'SkyStruct Interior',
        recipientName,
        recipientType,
        customMessage,
      });
    } catch (pdfErr) {
      console.warn('PDF generation failed, falling back to html email:', pdfErr);
    }

    const pdfFilename = `${qtnLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    // Send email via nodemailer with formatted body and attached PDF document
    let emailSent = false;
    let emailError = '';
    try {
      await sendEmail({
        to: targetEmail,
        subject,
        html: emailHtml,
        attachments: pdfBuffer
          ? [
              {
                filename: pdfFilename,
                content: pdfBuffer,
                contentType: 'application/pdf',
              },
            ]
          : undefined,
      });
      emailSent = true;
    } catch (mailErr: any) {
      console.warn('⚠️ sendEmail notification:', mailErr.message);
      emailError = mailErr.message;
    }

    // Record activity with appropriate description
    let activityRemark = '';
    if (recipientType === 'vendor') {
      activityRemark = `Sent Quotation "${quotation.title || qtnLabel}" (${qtnLabel}) to Vendor ${recipientName ? `"${recipientName}" ` : ''}(${targetEmail})${customMessage ? ` with note: "${customMessage.slice(0, 80)}..."` : ''}`;
    } else if (recipientType === 'other') {
      activityRemark = `Sent Quotation "${quotation.title || qtnLabel}" (${qtnLabel}) to ${recipientName ? `"${recipientName}" ` : ''}(${targetEmail})${customMessage ? ` with note: "${customMessage.slice(0, 80)}..."` : ''}`;
    } else {
      activityRemark = `Emailed Quotation "${quotation.title || qtnLabel}" (${qtnLabel}) (${(Number(quotation.grandTotal) || 0).toLocaleString()}) to client ${targetEmail} for approval`;
    }

    // If sent to customer or vendor, record dispatch directly in the customer's quotations array
    if (Array.isArray(customer.quotations)) {
      let targetIdx = typeof quotationIndex === 'number' && quotationIndex >= 0 && quotationIndex < customer.quotations.length
        ? quotationIndex
        : customer.quotations.findIndex((q: any) => q.version === quotation.version || q.quotationNumber === quotation.quotationNumber);

      if (targetIdx !== -1 && customer.quotations[targetIdx]) {
        const existingDispatches = Array.isArray(customer.quotations[targetIdx].dispatches)
          ? customer.quotations[targetIdx].dispatches
          : [];

        const newDispatchEntry = {
          id: `disp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          recipientType,
          recipientName: recipientName || (recipientType === 'customer' ? customer.name : 'Vendor'),
          recipientEmail: targetEmail,
          quotationTitle: quotation.title || `Quotation v${quotation.version}`,
          quotationNumber: qtnLabel,
          sentAt: new Date(),
          remarks: activityRemark,
        };

        customer.quotations[targetIdx].dispatches = [...existingDispatches, newDispatchEntry];

        if (recipientType === 'customer') {
          customer.quotations[targetIdx].status = 'Sent';
          customer.quotations[targetIdx].sentToClient = {
            clientEmail: targetEmail,
            clientName: recipientName || customer.name,
            sentAt: new Date(),
            customMessage: customMessage || undefined,
          };
        } else if (recipientType === 'vendor') {
          const existingSentVendors = Array.isArray(customer.quotations[targetIdx].sentVendors)
            ? customer.quotations[targetIdx].sentVendors
            : [];
          customer.quotations[targetIdx].sentVendors = [
            ...existingSentVendors,
            {
              id: `sent-v-${Date.now()}`,
              vendorName: recipientName || 'Vendor Partner',
              vendorEmail: targetEmail,
              quotationTitle: quotation.title || `Quotation v${quotation.version}`,
              quotationNumber: qtnLabel,
              sentAt: new Date(),
            },
          ];
        }

        customer.quotations[targetIdx].updatedAt = new Date();
        customer.markModified('quotations');
        await customer.save();
      }
    }

    await CrmActivity.create({
      customer: customer._id,
      user: auth.userId,
      organizationId: customer.organizationId || organizationId,
      type: 'Email',
      status: 'Completed',
      remarks: activityRemark,
      completedDate: new Date(),
    });

    try {
      const { logAuditEvent } = await import('@/services/audit.service');
      logAuditEvent({
        organizationId: customer.organizationId || organizationId,
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
      { emailedTo: targetEmail, recipientType, status: 'Sent', emailSent },
      recipientType === 'customer'
        ? `Quotation dispatched to customer (${targetEmail}) for approval.`
        : `Quotation copy dispatched to ${recipientName || targetEmail}.`
    );
  } catch (error: any) {
    console.error('Send Quotation Email error:', error);
    return errorResponse(error.message || 'Failed to send quotation email. Please verify SMTP settings.', 500);
  }
}

export const POST = withAuth(sendQuotationEmailHandler);
