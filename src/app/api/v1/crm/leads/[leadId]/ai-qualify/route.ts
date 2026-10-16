// =============================================================================
// InteriorOS Backend — CRM AI Lead Qualification scoring API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withPermission } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CRMLead } from '@/models/crm-lead.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

async function aiQualifyHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
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

    // ── AI Lead Scoring Algorithm Heuristics ───────────────────────────────
    let budgetScore = 20; // Default base
    let propertyScore = 15;
    let urgencyScore = 15;

    // Budget scoring (Max: 40)
    const budget = lead.budget || 0;
    if (budget >= 2500000) {
      budgetScore = 40;
    } else if (budget >= 1500000) {
      budgetScore = 32;
    } else if (budget >= 1000000) {
      budgetScore = 25;
    } else if (budget >= 500000) {
      budgetScore = 18;
    } else {
      budgetScore = 10;
    }

    // Property Type scoring (Max: 30)
    const pType = (lead.propertyType || '').toLowerCase();
    if (pType.includes('villa') || pType.includes('penthouse')) {
      propertyScore = 30;
    } else if (pType.includes('3 bhk') || pType.includes('4 bhk')) {
      propertyScore = 26;
    } else if (pType.includes('2 bhk')) {
      propertyScore = 20;
    } else if (pType.includes('commercial') || pType.includes('office')) {
      propertyScore = 25;
    } else {
      propertyScore = 15;
    }

    // Urgency scoring (Max: 30)
    const urgency = lead.urgency || 'medium';
    if (urgency === 'high') {
      urgencyScore = 28;
    } else if (urgency === 'medium') {
      urgencyScore = 18;
    } else {
      urgencyScore = 10;
    }

    const totalScore = budgetScore + propertyScore + urgencyScore;
    
    // Save calculated score to DB
    lead.leadScore = totalScore;
    await lead.save();

    // Prepare breakdown details
    const breakdown = [
      {
        factor: `Budget (₹${(budget / 100000).toFixed(1)}L)`,
        score: budgetScore,
        max: 40,
        description: budget >= 1500000 ? 'High-value premium scope' : budget >= 800000 ? 'Medium standard scope' : 'Basic scope limit',
      },
      {
        factor: `Property Type (${lead.propertyType || 'Not specified'})`,
        score: propertyScore,
        max: 30,
        description: pType.includes('villa') ? 'Premium high-end estate structure' : 'Standard residential design space',
      },
      {
        factor: `Urgency (${lead.urgency.toUpperCase()})`,
        score: urgencyScore,
        max: 30,
        description: urgency === 'high' ? 'Client wants to execute immediately' : 'Flexible execution window',
      },
    ];

    let recommendation = 'Standard Lead. Assign designer and establish contact to scope further.';
    if (totalScore >= 85) {
      recommendation = '⚠️ Hot Lead! High priority client with premium budget and immediate execution request. Assign senior designer and call within 1 hour.';
    } else if (totalScore >= 70) {
      recommendation = 'Warm Lead. High conversion potential. Schedule site visit and share a design proposal catalog.';
    }

    return successResponse({
      leadScore: totalScore,
      breakdown,
      recommendation,
    }, 'AI Lead qualification completed');
  } catch (error) {
    console.error('AI lead qualification error:', error);
    return serverErrorResponse();
  }
}

export const POST = withPermission('crm_leads', 'update', aiQualifyHandler);
