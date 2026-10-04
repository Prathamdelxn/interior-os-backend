// =============================================================================
// InteriorOS Backend — Quotation PDF Generator Service (PDFKit)
// =============================================================================

import PDFDocument from 'pdfkit';

export interface QuotationPdfItem {
  description?: string;
  itemName?: string;
  name?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  rate?: number | string;
  total?: number | string;
  amount?: number | string;
  unit?: string;
}

export interface QuotationPdfData {
  version: number;
  quotationNumber?: string;
  title?: string;
  items: QuotationPdfItem[];
  subtotal: number;
  taxPercentage: number;
  tax?: number;
  discount?: number;
  grandTotal?: number;
  notes?: string;
  createdAt?: Date | string;
}

export interface QuotationPdfOptions {
  companyName?: string;
  recipientName?: string;
  recipientType?: string;
  customMessage?: string;
}

/**
 * Generates an official, beautifully styled PDF buffer for a quotation.
 */
export async function generateQuotationPdfBuffer(
  customerName: string,
  quotation: QuotationPdfData,
  options: QuotationPdfOptions = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const companyName = options.companyName || 'SkyStruct Interior';
      const qtnNum = quotation.quotationNumber || `QTN-V${quotation.version || 1}`;
      const dateStr = new Date(quotation.createdAt || Date.now()).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `${qtnNum} - ${customerName}`,
          Author: companyName,
          Subject: 'Commercial Quotation',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width; // 595.28 for A4
      const leftMargin = 36;
      const rightMargin = pageWidth - 36;
      const contentWidth = rightMargin - leftMargin; // ~523.28

      // ── Header Banner ──────────────────────────────────────────────────────────
      doc
        .rect(leftMargin, 36, contentWidth, 68)
        .fillAndStroke('#0f172a', '#0f172a');

      // Header Text
      doc
        .fillColor('#ffffff')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(companyName, leftMargin + 16, 48);

      doc
        .fillColor('#94a3b8')
        .fontSize(9)
        .font('Helvetica')
        .text('COMMERCIAL QUOTATION & SCOPE OF WORK', leftMargin + 16, 74);

      // Header Right: Quotation Badge
      doc
        .fillColor('#38bdf8')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(qtnNum, leftMargin, 50, { align: 'right', width: contentWidth - 16 });

      doc
        .fillColor('#cbd5e1')
        .fontSize(9)
        .font('Helvetica')
        .text(`Date: ${dateStr}`, leftMargin, 74, { align: 'right', width: contentWidth - 16 });

      let currentY = 118;

      // ── Custom Message Banner (if provided) ──────────────────────────────────
      if (options.customMessage?.trim()) {
        const msgText = options.customMessage.trim();
        doc
          .rect(leftMargin, currentY, contentWidth, 36)
          .fillAndStroke('#eff6ff', '#bfdbfe');

        doc
          .fillColor('#1d4ed8')
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('MESSAGE / NOTE:', leftMargin + 10, currentY + 6);

        doc
          .fillColor('#1e3a8a')
          .fontSize(8.5)
          .font('Helvetica')
          .text(msgText.slice(0, 180) + (msgText.length > 180 ? '...' : ''), leftMargin + 10, currentY + 18, {
            width: contentWidth - 20,
          });

        currentY += 46;
      }

      // ── Client & Project Details ─────────────────────────────────────────────
      doc
        .rect(leftMargin, currentY, contentWidth, 48)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      doc
        .fillColor('#64748b')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(options.recipientType === 'vendor' ? 'PROJECT / CLIENT' : 'BILLED TO', leftMargin + 12, currentY + 10);

      doc
        .fillColor('#0f172a')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(customerName, leftMargin + 12, currentY + 22);

      if (options.recipientName && options.recipientType !== 'customer') {
        doc
          .fillColor('#475569')
          .fontSize(8.5)
          .font('Helvetica')
          .text(`Attention: ${options.recipientName} (${(options.recipientType || '').toUpperCase()})`, leftMargin + 12, currentY + 36);
      }

      // Meta Right Column
      doc
        .fillColor('#64748b')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('VERSION & STATUS', leftMargin, currentY + 10, { align: 'right', width: contentWidth - 12 });

      doc
        .fillColor('#0f172a')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`Version ${quotation.version || 1}`, leftMargin, currentY + 24, { align: 'right', width: contentWidth - 12 });

      currentY += 60;

      // ── Table Header ─────────────────────────────────────────────────────────
      const colNo = leftMargin + 8;
      const colDesc = leftMargin + 36;
      const colQty = leftMargin + 320;
      const colRate = leftMargin + 385;
      const colTotal = leftMargin + 450;

      doc
        .rect(leftMargin, currentY, contentWidth, 22)
        .fillAndStroke('#f1f5f9', '#cbd5e1');

      doc
        .fillColor('#334155')
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text('#', colNo, currentY + 6)
        .text('SCOPE / ITEM DESCRIPTION', colDesc, currentY + 6)
        .text('QTY', colQty, currentY + 6)
        .text('RATE (Rs)', colRate, currentY + 6)
        .text('TOTAL (Rs)', colTotal, currentY + 6);

      currentY += 22;

      // ── Line Items ───────────────────────────────────────────────────────────
      const items = quotation.items || [];
      const rowHeight = 22;

      items.forEach((item, index) => {
        // Page overflow check
        if (currentY + rowHeight > doc.page.height - 130) {
          doc.addPage();
          currentY = 40;

          // Repeat Table Header on new page
          doc
            .rect(leftMargin, currentY, contentWidth, 22)
            .fillAndStroke('#f1f5f9', '#cbd5e1');

          doc
            .fillColor('#334155')
            .fontSize(8.5)
            .font('Helvetica-Bold')
            .text('#', colNo, currentY + 6)
            .text('SCOPE / ITEM DESCRIPTION', colDesc, currentY + 6)
            .text('QTY', colQty, currentY + 6)
            .text('RATE (Rs)', colRate, currentY + 6)
            .text('TOTAL (Rs)', colTotal, currentY + 6);

          currentY += 22;
        }

        const isEven = index % 2 === 0;
        if (!isEven) {
          doc
            .rect(leftMargin, currentY, contentWidth, rowHeight)
            .fill('#f8fafc');
        }

        // Bottom border line
        doc
          .moveTo(leftMargin, currentY + rowHeight)
          .lineTo(rightMargin, currentY + rowHeight)
          .strokeColor('#e2e8f0')
          .stroke();

        const desc = item.description || item.itemName || item.name || `Item ${index + 1}`;
        const qty = Number(item.quantity) || 1;
        const rate = Number(item.unitPrice || item.rate) || 0;
        const total = Number(item.total || item.amount) || (qty * rate);

        doc
          .fillColor('#64748b')
          .fontSize(8.5)
          .font('Helvetica')
          .text(String(index + 1), colNo, currentY + 6);

        doc
          .fillColor('#0f172a')
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .text(desc.slice(0, 52), colDesc, currentY + 6);

        doc
          .fillColor('#334155')
          .fontSize(8.5)
          .font('Helvetica')
          .text(String(qty), colQty, currentY + 6)
          .text(rate.toLocaleString('en-IN'), colRate, currentY + 6);

        doc
          .fillColor('#0f172a')
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .text(total.toLocaleString('en-IN'), colTotal, currentY + 6);

        currentY += rowHeight;
      });

      // ── Totals & Summary ─────────────────────────────────────────────────────
      if (currentY > doc.page.height - 160) {
        doc.addPage();
        currentY = 40;
      }

      currentY += 14;

      const subtotal = Number(quotation.subtotal || 0);
      const tax = Number(quotation.tax || 0);
      const taxPct = Number(quotation.taxPercentage || 0);
      const discount = Number(quotation.discount || 0);
      const grandTotal = Number(quotation.grandTotal || 0);

      // Terms & Notes Box on left
      const notesBoxWidth = 260;
      doc
        .rect(leftMargin, currentY, notesBoxWidth, 75)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      doc
        .fillColor('#64748b')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('TERMS & CONDITIONS', leftMargin + 10, currentY + 8);

      const termsText = quotation.notes?.trim() ||
        '1. Validity: 15 days from issue date.\n2. Payment: As per approved project milestones.\n3. Taxes & statutory levies applicable as shown.';

      doc
        .fillColor('#475569')
        .fontSize(7.5)
        .font('Helvetica')
        .text(termsText.slice(0, 200), leftMargin + 10, currentY + 20, {
          width: notesBoxWidth - 20,
          lineGap: 2,
        });

      // Totals Box on right
      const totalsLeft = leftMargin + 280;
      const totalsWidth = contentWidth - 280;

      let totalsY = currentY;

      // Subtotal
      doc
        .fillColor('#64748b')
        .fontSize(8.5)
        .font('Helvetica')
        .text('Subtotal:', totalsLeft, totalsY);
      doc
        .fillColor('#1e293b')
        .font('Helvetica-Bold')
        .text(`Rs. ${subtotal.toLocaleString('en-IN')}`, totalsLeft, totalsY, { align: 'right', width: totalsWidth });

      totalsY += 15;

      if (taxPct > 0 || tax > 0) {
        doc
          .fillColor('#64748b')
          .font('Helvetica')
          .text(`GST (${taxPct}%):`, totalsLeft, totalsY);
        doc
          .fillColor('#1e293b')
          .font('Helvetica-Bold')
          .text(`Rs. ${tax.toLocaleString('en-IN')}`, totalsLeft, totalsY, { align: 'right', width: totalsWidth });
        totalsY += 15;
      }

      if (discount > 0) {
        doc
          .fillColor('#059669')
          .font('Helvetica')
          .text('Discount:', totalsLeft, totalsY);
        doc
          .fillColor('#059669')
          .font('Helvetica-Bold')
          .text(`-Rs. ${discount.toLocaleString('en-IN')}`, totalsLeft, totalsY, { align: 'right', width: totalsWidth });
        totalsY += 15;
      }

      // Grand Total Highlight
      doc
        .rect(totalsLeft - 6, totalsY, totalsWidth + 6, 24)
        .fill('#0f172a');

      doc
        .fillColor('#ffffff')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('GRAND TOTAL:', totalsLeft, totalsY + 6);

      doc
        .fillColor('#38bdf8')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`Rs. ${grandTotal.toLocaleString('en-IN')}`, totalsLeft, totalsY + 5, { align: 'right', width: totalsWidth - 4 });

      currentY += 95;

      // ── Signatures ───────────────────────────────────────────────────────────
      if (currentY > doc.page.height - 80) {
        doc.addPage();
        currentY = 40;
      }

      doc
        .moveTo(leftMargin, currentY + 28)
        .lineTo(leftMargin + 180, currentY + 28)
        .strokeColor('#94a3b8')
        .stroke();

      doc
        .fillColor('#64748b')
        .fontSize(8)
        .font('Helvetica')
        .text(`Authorized Signatory (${companyName})`, leftMargin, currentY + 34);

      doc
        .moveTo(rightMargin - 180, currentY + 28)
        .lineTo(rightMargin, currentY + 28)
        .strokeColor('#94a3b8')
        .stroke();

      doc
        .fillColor('#64748b')
        .fontSize(8)
        .font('Helvetica')
        .text('Client Acceptance Sign & Date', rightMargin - 180, currentY + 34, { align: 'right', width: 180 });

      // End document
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
