// =============================================================================
// InteriorOS Backend — BOQ Excel Import API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { BOQ } from '@/models/boq.model';
import { BOQItem } from '@/models/boq.model';
import { createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import * as XLSX from 'xlsx';

// POST: Import BOQ from Excel file
async function importBoqHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return errorResponse('Excel file is required', 400);
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return errorResponse('Only .xlsx or .xls files are accepted', 400);
    }

    // Parse Excel file
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

    if (!rawData || rawData.length === 0) {
      return errorResponse('Excel file is empty or has no valid rows', 400);
    }

    // Map columns (flexible — tries common header names)
    const items: Array<{
      serialNumber: number;
      category: string;
      itemName: string;
      description: string;
      quantity: number;
      unit: string;
      rate: number;
    }> = [];

    const errors: string[] = [];

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNum = i + 2; // Excel rows start at 1, header is row 1

      // Flexible column name mapping
      const serialNumber = row['S.No'] || row['Sr No'] || row['Serial No'] || row['SNo'] || row['#'] || (i + 1);
      const category = row['Category'] || row['Trade'] || row['Work Category'] || row['Section'] || '';
      const itemName = row['Item'] || row['Item Name'] || row['Description'] || row['Material'] || row['Name'] || '';
      const description = row['Description'] || row['Remarks'] || row['Specification'] || row['Desc'] || '';
      const quantity = parseFloat(row['Qty'] || row['Quantity'] || row['Nos'] || '0');
      const unit = row['Unit'] || row['UOM'] || row['Units'] || 'nos';
      const rate = parseFloat(row['Rate'] || row['Unit Rate'] || row['Price'] || row['Unit Price'] || '0');

      if (!itemName) {
        errors.push(`Row ${rowNum}: Missing item name`);
        continue;
      }

      if (isNaN(quantity) || quantity < 0) {
        errors.push(`Row ${rowNum}: Invalid quantity for "${itemName}"`);
        continue;
      }

      if (isNaN(rate) || rate < 0) {
        errors.push(`Row ${rowNum}: Invalid rate for "${itemName}"`);
        continue;
      }

      items.push({
        serialNumber: parseInt(String(serialNumber), 10) || (i + 1),
        category: String(category).trim() || 'General',
        itemName: String(itemName).trim(),
        description: String(description === itemName ? '' : description).trim(),
        quantity,
        unit: String(unit).trim(),
        rate,
      });
    }

    if (items.length === 0) {
      return errorResponse(`No valid items found in Excel. Errors: ${errors.join('; ')}`, 400);
    }

    // Calculate total
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);

    // Create BOQ version
    const lastBoq = await BOQ.findOne({ projectId, organizationId })
      .sort({ version: -1 })
      .select('version');

    const nextVersion = lastBoq ? lastBoq.version + 1 : 1;
    const versionLabel = `v${nextVersion}.0`;

    const boq = new BOQ({
      organizationId,
      projectId,
      version: nextVersion,
      versionLabel,
      status: 'draft',
      totalAmount,
      currency: 'INR',
      notes: `Imported from ${file.name}`,
      importedFrom: 'excel',
      importFileName: file.name,
      createdBy: auth.userId,
    });

    await boq.save();

    // Create items
    const boqItems = items.map((item) => ({
      organizationId,
      projectId,
      boqId: boq._id,
      serialNumber: item.serialNumber,
      category: item.category,
      itemName: item.itemName,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
      amount: item.quantity * item.rate,
      consumedQuantity: 0,
      remainingQuantity: item.quantity,
      variancePercentage: 0,
    }));

    await BOQItem.insertMany(boqItems);

    const createdItems = await BOQItem.find({ boqId: boq._id, isDeleted: false }).sort({ serialNumber: 1 });

    return createdResponse(
      {
        ...boq.toJSON(),
        items: createdItems,
        importSummary: {
          fileName: file.name,
          totalRowsParsed: rawData.length,
          itemsImported: items.length,
          skippedRows: errors.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      },
      `BOQ imported from ${file.name} — ${items.length} items created`
    );
  } catch (error) {
    console.error('Import BOQ error:', error);
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('boq', 'create', importBoqHandler);
