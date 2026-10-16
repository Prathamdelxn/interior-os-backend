// =============================================================================
// InteriorOS Backend — CRM AI WBS & BOQ Generator API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withPermission } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CRMLead } from '@/models/crm-lead.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

// Generate mock items for WBS and BOQ based on rooms lists and style
function generateAiBoqAndWbs(rooms: string[], style: string = 'Modern Minimalist', leadBudget: number = 1000000) {
  const wbs: any[] = [];
  const boq: any[] = [];
  
  // Budget factors based on style
  let rateMultiplier = 1.0;
  const lowercaseStyle = style.toLowerCase();
  if (lowercaseStyle.includes('premium') || lowercaseStyle.includes('luxury') || lowercaseStyle.includes('veneer')) {
    rateMultiplier = 1.4;
  } else if (lowercaseStyle.includes('classical') || lowercaseStyle.includes('traditional')) {
    rateMultiplier = 1.25;
  } else if (lowercaseStyle.includes('budget') || lowercaseStyle.includes('simple')) {
    rateMultiplier = 0.8;
  }

  rooms.forEach((room) => {
    const rName = room.trim();
    if (!rName) return;

    const wbsPackage = {
      packageName: `${rName} Interior Fit-out`,
      trade: 'Carpentry & Finishes',
      tasks: [] as string[],
    };

    if (rName.toLowerCase().includes('kitchen')) {
      wbsPackage.tasks = [
        'Civil counter platform dismantling & masonry layout',
        'Modular cabinetry carcass wood framing',
        'Kitchen granite/quartz countertop cutting & stone fitting',
        'Backsplash tiles masonry layout & grouting',
        'Kitchen hob, chimney & electrical socket utility wiring',
        'Laminate/acrylic shutters alignment & hardware installation',
      ];

      boq.push(
        {
          item: `Modular Kitchen Bottom Cabinets - Waterproof Plywood`,
          category: 'Woodwork',
          quantity: 12,
          unit: 'Rft',
          rate: Math.round(3500 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Premium Quartz Countertop (Double Mold Edge)`,
          category: 'Stone',
          quantity: 12,
          unit: 'Rft',
          rate: Math.round(2200 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Modular Kitchen Overhead Wall Cabinets`,
          category: 'Woodwork',
          quantity: 10,
          unit: 'Rft',
          rate: Math.round(2800 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Kitchen Backsplash Dado Tiles (2x1 Ft Vitrified)`,
          category: 'Masonry',
          quantity: 60,
          unit: 'Sqft',
          rate: Math.round(140 * rateMultiplier),
          amount: 0,
        }
      );
    } else if (rName.toLowerCase().includes('living') || rName.toLowerCase().includes('hall')) {
      wbsPackage.tasks = [
        'Living room false ceiling framing & board fixing',
        'TV entertainment console veneer fabrication',
        'Accent wall framing, putty & painting/wallpapering',
        'Living room light fittings & cove LED wiring',
        'Main entry door wood polish & heavy hardware installation',
      ];

      boq.push(
        {
          item: `TV Unit Entertainment console (Veneer Finish with PU Coat)`,
          category: 'Woodwork',
          quantity: 1,
          unit: 'Nos',
          rate: Math.round(48000 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Designer Gypsum Board False Ceiling with Cove Channel`,
          category: 'Ceiling',
          quantity: 260,
          unit: 'Sqft',
          rate: Math.round(125 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Living Room Royal Lustre Painting (2 Coats over Putty)`,
          category: 'Finishes',
          quantity: 900,
          unit: 'Sqft',
          rate: Math.round(45 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Premium Textures Accent Wall Covering`,
          category: 'Finishes',
          quantity: 150,
          unit: 'Sqft',
          rate: Math.round(95 * rateMultiplier),
          amount: 0,
        }
      );
    } else if (rName.toLowerCase().includes('bedroom')) {
      wbsPackage.tasks = [
        'Bedroom sliding door wardrobe carcass assembly',
        'Cushioned fabric headboard framing & wall mounting',
        'Dressing table and storage unit woodwork fabrication',
        'Bedroom ceiling board fixing & spot lighting wiring',
        'General bedroom painting & surface sanding',
      ];

      boq.push(
        {
          item: `Sliding Door Wardrobe (MDF Core with Veneer/Laminate)`,
          category: 'Woodwork',
          quantity: 60,
          unit: 'Sqft',
          rate: Math.round(1450 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Bedhead Fabric Upholstered Cushioned Panel`,
          category: 'Finishes',
          quantity: 1,
          unit: 'Nos',
          rate: Math.round(18000 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Bedroom False Ceiling board work`,
          category: 'Ceiling',
          quantity: 180,
          unit: 'Sqft',
          rate: Math.round(115 * rateMultiplier),
          amount: 0,
        },
        {
          item: `Dressing Unit Console with Mirror & Drawer`,
          category: 'Woodwork',
          quantity: 1,
          unit: 'Nos',
          rate: Math.round(14000 * rateMultiplier),
          amount: 0,
        }
      );
    } else {
      // General Room template
      wbsPackage.tasks = [
        `${rName} room surface sanding and masking`,
        `${rName} custom modular woodwork carcass assembly`,
        `${rName} electrical spot light wiring & socket mounting`,
        `${rName} room paint priming & finishing coats`,
      ];

      boq.push(
        {
          item: `${rName} Custom Laminate Storage Cabinets`,
          category: 'Woodwork',
          quantity: 25,
          unit: 'Sqft',
          rate: Math.round(1200 * rateMultiplier),
          amount: 0,
        },
        {
          item: `${rName} Acrylic Paint Finishing Work`,
          category: 'Finishes',
          quantity: 450,
          unit: 'Sqft',
          rate: Math.round(38 * rateMultiplier),
          amount: 0,
        }
      );
    }

    wbs.push(wbsPackage);
  });

  // Calculate BOQ item amounts
  boq.forEach((item) => {
    item.amount = item.quantity * item.rate;
  });

  // Calculate costs
  const materialCost = Math.round(boq.reduce((acc, it) => acc + it.amount, 0) * 0.65);
  const laborCost = Math.round(boq.reduce((acc, it) => acc + it.amount, 0) * 0.35);

  return {
    wbs,
    boq,
    costSummary: {
      materialCost,
      laborCost,
    },
  };
}

async function aiGenerateHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { leadId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return errorResponse('Invalid Lead ID', 400);
    }

    const lead = await CRMLead.findOne({
      _id: leadId,
      organizationId,
      isDeleted: false,
    });

    if (!lead) {
      return errorResponse('Lead not found', 404);
    }

    const rooms = lead.requirements?.rooms || [];
    if (rooms.length === 0) {
      return errorResponse('Please add at least one room under Requirements before generating estimates.', 400);
    }

    const style = lead.requirements?.style || 'Modern Minimalist';
    const budget = lead.requirements?.budget || lead.budget || 1000000;

    const generated = generateAiBoqAndWbs(rooms, style, budget);

    // Update requirements flag
    lead.requirements.aiWbsGenerated = true;
    lead.requirements.aiBoqGenerated = true;
    await lead.save();

    return successResponse(generated, 'AI WBS & BOQ structure generated successfully');
  } catch (error) {
    console.error('AI generate estimate error:', error);
    return serverErrorResponse();
  }
}

export const POST = withPermission('crm_leads', 'update', aiGenerateHandler);
