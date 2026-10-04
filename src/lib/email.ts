// =============================================================================
// InteriorOS Backend — Email Service (Nodemailer)
// =============================================================================

import nodemailer from 'nodemailer';
import { env } from '@/config/env';

const smtpPass = (env.SMTP_PASS || '').replace(/\s+/g, '');
const isGmail = env.SMTP_HOST.toLowerCase().includes('gmail');

const transporter = nodemailer.createTransport({
  ...(isGmail ? { service: 'gmail' } : { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE || env.SMTP_PORT === 465 }),
  auth: {
    user: env.SMTP_USER,
    pass: smtpPass,
  },
});

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const fromAddress = options.from || env.SMTP_USER || env.EMAIL_FROM;
  try {
    await transporter.sendMail({
      from: `"${env.APP_NAME}" <${fromAddress}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });
    console.log(`✅ Email sent to ${options.to}`);
  } catch (error: any) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
}

// ── Email Templates ──────────────────────────────────────────────────────────

export function verificationEmailTemplate(name: string, verificationUrl: string): string {
  return `
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">SkyStruct Lite Interior</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
        <h2 style="font-size: 20px; font-weight: 600; color: #0f172a; margin: 0 0 16px;">Verify your email</h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
          Hi ${name}, welcome to SkyStruct Lite Interior! Please verify your email address to get started.
        </p>
        <a href="${verificationUrl}" style="display: inline-block; background: #0f172a; color: #ffffff; font-size: 14px; font-weight: 500; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          Verify Email Address
        </a>
        <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0; line-height: 1.5;">
          This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
}

export function resetPasswordEmailTemplate(name: string, otp: string): string {
  return `
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">SkyStruct Lite Interior</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
        <h2 style="font-size: 20px; font-weight: 600; color: #0f172a; margin: 0 0 16px;">Reset your password</h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
          Hi ${name}, we received a request to reset your password. Use the following OTP to set a new password.
        </p>
        <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <span style="font-family: monospace; font-size: 32px; font-weight: 700; color: #0f172a; letter-spacing: 6px;">${otp}</span>
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0; line-height: 1.5;">
          This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
}

export function welcomeEmailTemplate(name: string, loginUrl: string): string {
  return `
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">SkyStruct Lite Interior</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
        <h2 style="font-size: 20px; font-weight: 600; color: #0f172a; margin: 0 0 16px;">Welcome to SkyStruct Lite Interior!</h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
          Hi ${name}, your account has been verified successfully. You're all set to start managing your interior fit-out projects.
        </p>
        <a href="${loginUrl}" style="display: inline-block; background: #0f172a; color: #ffffff; font-size: 14px; font-weight: 500; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          Go to Dashboard
        </a>
      </div>
    </div>
  `;
}

export function otpEmailTemplate(name: string, otp: string): string {
  return `
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0;">SkyStruct Lite Interior</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
        <h2 style="font-size: 20px; font-weight: 600; color: #0f172a; margin: 0 0 16px;">Verify your email address</h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
          Hi ${name}, please use the following one-time password (OTP) to complete your signup process.
        </p>
        <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <span style="font-family: monospace; font-size: 32px; font-weight: 700; color: #0f172a; letter-spacing: 6px;">${otp}</span>
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.5;">
          This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
}

export function quotationInvoiceEmailTemplate(
  customerName: string,
  quotation: {
    version: number;
    quotationNumber?: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    subtotal: number;
    taxPercentage: number;
    tax?: number;
    discount?: number;
    grandTotal?: number;
    notes?: string;
    createdAt?: Date | string;
  },
  companyName: string = 'SkyStruct-Lite Interior',
  options?: {
    customMessage?: string;
    recipientName?: string;
    recipientType?: string;
  }
): string {
  const customMessage = options?.customMessage?.trim();
  const recipientName = options?.recipientName?.trim();
  const recipientType = options?.recipientType || 'customer';

  const formattedItems = (quotation.items || []).map((item: any, idx) => {
    const desc = item.description || item.itemName || item.name || `Item ${idx + 1}`;
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice || item.rate) || 0;
    const total = Number(item.total || item.amount) || (qty * price);
    return `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 12px; font-size: 13px; color: #334155; text-align: center;">${idx + 1}</td>
      <td style="padding: 12px; font-size: 13px; color: #0f172a; font-weight: 500;">${desc}</td>
      <td style="padding: 12px; font-size: 13px; color: #334155; text-align: center;">${qty}</td>
      <td style="padding: 12px; font-size: 13px; color: #334155; text-align: right;">₹${price.toLocaleString('en-IN')}</td>
      <td style="padding: 12px; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">₹${total.toLocaleString('en-IN')}</td>
    </tr>
  `;
  }).join('');

  const qtnNum = quotation.quotationNumber || `QTN-V${quotation.version}`;
  const dateStr = new Date(quotation.createdAt || Date.now()).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; background-color: #f8fafc;">
      <!-- Main Container Card -->
      <div style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; color: #ffffff;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td>
                <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">${companyName}</h1>
                <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Commercial Quotation & Scope of Work</p>
              </td>
              <td align="right" valign="top">
                <span style="display: inline-block; background-color: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; color: #38bdf8;">
                  ${qtnNum}
                </span>
              </td>
            </tr>
          </table>
        </div>

        <!-- Custom Message Banner if provided -->
        ${customMessage ? `
          <div style="margin: 20px 32px 0; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1d4ed8; letter-spacing: 0.5px;">Message / Note</p>
            <p style="margin: 0; font-size: 13px; color: #1e3a8a; line-height: 1.5; white-space: pre-wrap;">${customMessage}</p>
          </div>
        ` : ''}

        <!-- Details Section -->
        <div style="padding: 24px 32px 16px; background-color: #ffffff;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td valign="top" width="50%">
                <p style="margin: 0; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">
                  ${recipientType === 'vendor' ? 'Project / Client' : 'Billed To'}
                </p>
                <p style="margin: 4px 0 0; font-size: 15px; font-weight: 700; color: #0f172a;">${customerName}</p>
                ${recipientName && recipientType !== 'customer' ? `
                  <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">
                    <span style="font-weight: 600;">Recipient:</span> ${recipientName} (${recipientType.toUpperCase()})
                  </p>
                ` : ''}
              </td>
              <td valign="top" width="50%" align="right">
                <p style="margin: 0; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">Quotation Date</p>
                <p style="margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #334155;">${dateStr}</p>
              </td>
            </tr>
          </table>
        </div>

        <!-- Line Items Table -->
        <div style="padding: 0 32px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-top: 8px;">
            <thead>
              <tr style="background-color: #f1f5f9; border-radius: 8px;">
                <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; text-align: center; border-top-left-radius: 8px;">#</th>
                <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; text-align: left;">Item Description</th>
                <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; text-align: center;">Qty</th>
                <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; text-align: right;">Unit Price</th>
                <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; text-align: right; border-top-right-radius: 8px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${formattedItems}
            </tbody>
          </table>
        </div>

        <!-- Summary Totals -->
        <div style="padding: 20px 32px 28px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="50%" valign="top">
                ${quotation.notes ? `
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; margin-right: 16px;">
                    <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">Terms & Notes</p>
                    <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">${quotation.notes}</p>
                  </div>
                ` : ''}
              </td>
              <td width="50%" valign="top" align="right">
                <table border="0" cellspacing="0" cellpadding="4" style="min-width: 220px;">
                  <tr>
                    <td style="font-size: 13px; color: #64748b;">Subtotal:</td>
                    <td align="right" style="font-size: 13px; font-weight: 600; color: #334155;">₹${(quotation.subtotal || 0).toLocaleString('en-IN')}</td>
                  </tr>
                  ${quotation.taxPercentage ? `
                    <tr>
                      <td style="font-size: 13px; color: #64748b;">GST (${quotation.taxPercentage}%):</td>
                      <td align="right" style="font-size: 13px; font-weight: 600; color: #334155;">₹${(quotation.tax || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ` : ''}
                  ${quotation.discount ? `
                    <tr>
                      <td style="font-size: 13px; color: #059669;">Discount:</td>
                      <td align="right" style="font-size: 13px; font-weight: 600; color: #059669;">-₹${(quotation.discount || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ` : ''}
                  <tr style="border-top: 2px solid #e2e8f0;">
                    <td style="padding-top: 8px; font-size: 15px; font-weight: 800; color: #0f172a;">Grand Total:</td>
                    <td align="right" style="padding-top: 8px; font-size: 16px; font-weight: 800; color: #2563eb;">₹${(quotation.grandTotal || 0).toLocaleString('en-IN')}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            Thank you for considering <strong>${companyName}</strong> for your interior fit-out needs!
          </p>
        </div>

      </div>
    </div>
  `;
}

export function generateQuotationStandaloneDocumentHtml(
  customerName: string,
  quotation: {
    version: number;
    quotationNumber?: string;
    title?: string;
    items: Array<{ description?: string; itemName?: string; name?: string; quantity?: any; unitPrice?: any; rate?: any; total?: any; amount?: any; unit?: string }>;
    subtotal: number;
    taxPercentage: number;
    tax?: number;
    discount?: number;
    grandTotal?: number;
    notes?: string;
    createdAt?: Date | string;
  },
  companyName: string = 'SkyStruct Interior',
  options?: {
    customMessage?: string;
    recipientName?: string;
    recipientType?: string;
  }
): string {
  const qtnNum = quotation.quotationNumber || `QTN-V${quotation.version || 1}`;
  const dateStr = new Date(quotation.createdAt || Date.now()).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const recipientName = options?.recipientName?.trim();
  const recipientType = options?.recipientType || 'customer';
  const customMessage = options?.customMessage?.trim();

  const formattedItems = (quotation.items || []).map((item: any, idx) => {
    const desc = item.description || item.itemName || item.name || `Item ${idx + 1}`;
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice || item.rate) || 0;
    const total = Number(item.total || item.amount) || (qty * price);
    const unit = item.unit || 'Nos';
    return `
      <tr>
        <td style="text-align: center; color: #64748b; font-size: 12px;">${idx + 1}</td>
        <td>
          <div style="font-weight: 600; color: #0f172a; font-size: 13px;">${desc}</div>
        </td>
        <td style="text-align: center; font-size: 13px; color: #334155;">${qty} <span style="font-size: 10px; color: #94a3b8;">${unit}</span></td>
        <td style="text-align: right; font-size: 13px; color: #334155;">₹${price.toLocaleString('en-IN')}</td>
        <td style="text-align: right; font-weight: 700; font-size: 13px; color: #0f172a;">₹${total.toLocaleString('en-IN')}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${qtnNum} - ${customerName} - ${companyName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 32px;
      line-height: 1.5;
    }
    .doc-container {
      max-width: 850px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px -2px rgba(0,0,0,0.06);
    }
    .doc-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      padding: 36px 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
    }
    .brand-subtitle {
      font-size: 13px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 600;
      margin-top: 4px;
    }
    .badge-qtn {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: #38bdf8;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 800;
      font-size: 14px;
      text-align: right;
    }
    .doc-body {
      padding: 36px 40px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #f1f5f9;
      margin-bottom: 28px;
    }
    .meta-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      font-weight: 700;
    }
    .meta-value {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 4px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
    }
    .items-table th {
      background: #f8fafc;
      color: #475569;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      padding: 12px 14px;
      border-bottom: 2px solid #e2e8f0;
    }
    .items-table td {
      padding: 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .totals-wrapper {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 32px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
    }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 6px 0;
      font-size: 13px;
    }
    .grand-total-row td {
      border-top: 2px solid #0f172a;
      padding-top: 12px;
      font-size: 18px;
      font-weight: 800;
      color: #2563eb;
    }
    .notes-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 20px;
    }
    .signatures-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 48px;
      padding-top: 32px;
      border-top: 1px dashed #cbd5e1;
    }
    .sig-line {
      border-top: 1px solid #94a3b8;
      margin-top: 40px;
      padding-top: 8px;
      font-size: 12px;
      color: #64748b;
      font-weight: 600;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .doc-container { border: none; box-shadow: none; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="doc-container">
    <div class="doc-header">
      <div>
        <div class="brand-title">${companyName}</div>
        <div class="brand-subtitle">Commercial Quotation & Scope of Work</div>
      </div>
      <div class="badge-qtn">
        ${qtnNum}
      </div>
    </div>

    <div class="doc-body">
      ${customMessage ? `
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1d4ed8; letter-spacing: 0.5px;">Message / Note:</div>
          <div style="font-size: 13px; color: #1e3a8a; margin-top: 4px; white-space: pre-wrap;">${customMessage}</div>
        </div>
      ` : ''}

      <div class="meta-grid">
        <div>
          <div class="meta-label">${recipientType === 'vendor' ? 'Project / Client' : 'Client Name'}</div>
          <div class="meta-value">${customerName}</div>
          ${recipientName && recipientType !== 'customer' ? `
            <div style="font-size: 13px; color: #475569; margin-top: 4px;">
              <strong>Recipient:</strong> ${recipientName} (${recipientType.toUpperCase()})
            </div>
          ` : ''}
        </div>
        <div style="text-align: right;">
          <div class="meta-label">Quotation Date</div>
          <div class="meta-value">${dateStr}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
            Document Version: v${quotation.version || 1}
          </div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 48px; text-align: center;">#</th>
            <th style="text-align: left;">Scope / Item Description</th>
            <th style="width: 80px; text-align: center;">Qty</th>
            <th style="width: 130px; text-align: right;">Rate</th>
            <th style="width: 140px; text-align: right;">Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${formattedItems}
        </tbody>
      </table>

      <div class="totals-wrapper">
        <div>
          ${quotation.notes ? `
            <div class="notes-box">
              <div class="meta-label" style="margin-bottom: 6px;">Terms, Inclusions & Notes:</div>
              <div style="font-size: 12px; color: #475569; line-height: 1.6; white-space: pre-wrap;">${quotation.notes}</div>
            </div>
          ` : `
            <div class="notes-box">
              <div class="meta-label" style="margin-bottom: 4px;">Payment & Execution Terms:</div>
              <div style="font-size: 12px; color: #64748b; line-height: 1.5;">
                • Quotation validity: 15 days from issue date.<br>
                • Work shall commence upon advance payment and design sign-off.
              </div>
            </div>
          `}
        </div>

        <div>
          <table class="totals-table">
            <tr>
              <td style="color: #64748b;">Subtotal:</td>
              <td style="text-align: right; font-weight: 600; color: #334155;">₹${(quotation.subtotal || 0).toLocaleString('en-IN')}</td>
            </tr>
            ${quotation.taxPercentage ? `
              <tr>
                <td style="color: #64748b;">GST (${quotation.taxPercentage}%):</td>
                <td style="text-align: right; font-weight: 600; color: #334155;">₹${(quotation.tax || 0).toLocaleString('en-IN')}</td>
              </tr>
            ` : ''}
            ${quotation.discount ? `
              <tr>
                <td style="color: #059669;">Discount:</td>
                <td style="text-align: right; font-weight: 600; color: #059669;">-₹${(quotation.discount || 0).toLocaleString('en-IN')}</td>
              </tr>
            ` : ''}
            <tr class="grand-total-row">
              <td>Grand Total:</td>
              <td style="text-align: right;">₹${(quotation.grandTotal || 0).toLocaleString('en-IN')}</td>
            </tr>
          </table>
        </div>
      </div>

      <div class="signatures-section">
        <div>
          <div class="sig-line">Prepared & Authorized By (${companyName})</div>
        </div>
        <div>
          <div class="sig-line" style="text-align: right;">Client Acceptance Sign & Date</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}


