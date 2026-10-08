import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { PurchaseOrder } from '@/models/purchase-order.model';
import { Vendor } from '@/models/vendor.model';
import { sendEmail } from '@/lib/email';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const sendRfqSchema = z.object({
  poId: z.string().min(1, 'poId is required'),
  vendorIds: z.array(z.string()).min(1, 'At least one vendorId is required'),
  notes: z.string().optional(),
  rfqLink: z.string().url().optional(),
});

async function sendRfqHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    
    const body = await req.json();
    const validation = sendRfqSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { poId, vendorIds, notes, rfqLink } = validation.data;

    // 1. Fetch Purchase Order
    const po = await PurchaseOrder.findOne({
      _id: poId,
      organizationId,
      isDeleted: false,
    });

    if (!po) {
      return errorResponse('Purchase Order not found', 404);
    }

    // 2. Fetch Vendors
    const vendors = await Vendor.find({
      _id: { $in: vendorIds },
      organizationId,
    });

    if (!vendors || vendors.length === 0) {
      return errorResponse('No valid vendors found', 404);
    }

    // 3. Prepare email HTML
    let itemsHtml = `
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px; margin-top: 15px; margin-bottom: 15px;">
        <thead>
          <tr style="background-color: #f1f5f9; text-align: left;">
            <th>Item Name</th>
            <th>Quantity</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
    `;

    po.items.forEach(item => {
      itemsHtml += `
        <tr>
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>${item.unit}</td>
        </tr>
      `;
    });

    itemsHtml += `
        </tbody>
      </table>
    `;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background-color: #ffffff; max-width: 650px; margin: 0 auto; padding: 20px; color: #333;">
        <h2>Request for Quotation (RFQ)</h2>
        <p>Dear Vendor,</p>
        <p>Please provide a quotation for the following materials requested for PO <strong>${po.poNumber}</strong>:</p>
        
        ${itemsHtml}

        ${notes ? `<p style="margin-top: 20px;"><strong>Additional Notes:</strong><br/>${notes}</p>` : ''}
        ${rfqLink ? `
        <div style="margin-top: 25px; margin-bottom: 25px; text-align: center;">
          <a href="${rfqLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Submit Quotation Form
          </a>
          <p style="margin-top: 10px; font-size: 12px; color: #666;">Or copy this link: <a href="${rfqLink}">${rfqLink}</a></p>
        </div>
        ` : ''}
        
        <p style="margin-top: 30px;">Looking forward to your response.</p>
        <p>Regards,<br/>InteriorOS Team</p>
      </div>
    `;

    // 4. Send emails
    const emailPromises = vendors.map(vendor => {
      if (vendor.email) {
        return sendEmail({
          to: vendor.email,
          subject: `RFQ for Materials - PO: ${po.poNumber}`,
          html: htmlContent,
        });
      }
      return Promise.resolve();
    });

    await Promise.all(emailPromises);

    // 5. Return success matching frontend expectation
    return new Response(JSON.stringify({ success: true, message: "Emails sent" }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Send RFQ error:', error);
    return serverErrorResponse();
  }
}

export const POST = withAuth(sendRfqHandler);
