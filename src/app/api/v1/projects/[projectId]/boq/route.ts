// =============================================================================
// InteriorOS Backend — BOQ API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { BOQ } from '@/models/boq.model';
import { BOQItem } from '@/models/boq.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const boqItemSchema = z.object({
  serialNumber: z.number().optional(),
  itemCode: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  sectionNumber: z.string().optional(),
  sectionTitle: z.string().optional(),
  sectionScope: z.string().optional(),
  itemName: z.string().min(1, 'Item name is required'),
  description: z.string().optional(),
  brandMakes: z.string().optional(),
  quantity: z.number().min(0, 'Quantity must be non-negative'),
  unit: z.string().min(1, 'Unit is required'),
  rate: z.number().min(0, 'Rate must be non-negative').optional(),
  amount: z.number().optional(),
  remarks: z.string().optional(),
});

const createBoqSchema = z.object({
  notes: z.string().optional(),
  sections: z.array(z.any()).optional(),
  items: z.array(boqItemSchema).min(1, 'At least one item is required'),
});

// GET: List all BOQ versions for a project
async function listBoqHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const boqs = await BOQ.find({ projectId, organizationId, isDeleted: false })
      .populate('createdBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('submittedBy', 'firstName lastName email')
      .sort({ version: -1 });

    // For each BOQ, get item count
    const enrichedBoqs = await Promise.all(
      boqs.map(async (boq) => {
        const itemCount = await BOQItem.countDocuments({ boqId: boq._id, isDeleted: false });
        return {
          ...boq.toJSON(),
          itemCount,
        };
      })
    );

    return successResponse(enrichedBoqs);
  } catch (error) {
    console.error('List BOQ error:', error);
    return serverErrorResponse();
  }
}

// POST: Create a new BOQ with items
async function createBoqHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const validation = createBoqSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { notes, sections, items } = validation.data;

    // Determine next version number
    const lastBoq = await BOQ.findOne({ projectId, organizationId })
      .sort({ version: -1 })
      .select('version');

    const nextVersion = lastBoq ? lastBoq.version + 1 : 1;
    const versionLabel = `v${nextVersion}.0`;

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.amount !== undefined ? item.amount : item.quantity * (item.rate || 0)), 0);

    // Create BOQ
    const boq = new BOQ({
      organizationId,
      projectId,
      version: nextVersion,
      versionLabel,
      status: 'draft',
      totalAmount,
      currency: 'INR',
      notes,
      sections: sections || [],
      importedFrom: 'manual',
      createdBy: auth.userId,
    });

    await boq.save();

    // Create BOQ Items
    const boqItems = items.map((item, idx) => ({
      organizationId,
      projectId,
      boqId: boq._id,
      serialNumber: item.serialNumber || idx + 1,
      itemCode: item.itemCode || String(item.serialNumber || idx + 1),
      category: item.category,
      sectionNumber: item.sectionNumber || '',
      sectionTitle: item.sectionTitle || item.category || '',
      sectionScope: item.sectionScope || '',
      itemName: item.itemName,
      description: item.description || '',
      brandMakes: item.brandMakes || '',
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate || 0,
      amount: item.amount !== undefined ? item.amount : item.quantity * (item.rate || 0),
      remarks: item.remarks || '',
      consumedQuantity: 0,
      remainingQuantity: item.quantity,
      variancePercentage: 0,
    }));

    await BOQItem.insertMany(boqItems);

    // Return BOQ with items
    const createdItems = await BOQItem.find({ boqId: boq._id, isDeleted: false }).sort({ serialNumber: 1 });

    return createdResponse(
      { ...boq.toJSON(), items: createdItems },
      'BOQ created successfully'
    );
  } catch (error: any) {
    console.error('Create BOQ error:', error);
    if (error.code === 11000) {
      return errorResponse('A BOQ with this version already exists for this project', 409);
    }
    return serverErrorResponse();
  }
}

export const GET = withAuth(listBoqHandler);
export const POST = withAuth(createBoqHandler);
