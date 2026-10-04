// =============================================================================
// InteriorOS Backend — Organization Settings API: Get & Update
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Organization } from '@/models/organization.model';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  country: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  currencySymbol: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  dateFormat: z.string().trim().optional(),
  language: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  website: z.string().trim().optional(),
});

// GET: Retrieve organization settings
async function getSettingsHandler(_req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    const organization = await Organization.findById(organizationId).lean();
    if (!organization) {
      return notFoundResponse('Organization not found');
    }

    return successResponse({
      id: organization._id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      industry: organization.industry,
      website: organization.website,
      address: organization.address,
      settings: organization.settings,
      subscription: organization.subscription,
    });
  } catch (error) {
    console.error('Get organization settings error:', error);
    return serverErrorResponse();
  }
}

// PATCH: Update organization settings
async function updateSettingsHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    const validation = updateSettingsSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { name, country, currency, timezone, dateFormat, language, industry, website } = validation.data;

    const org = await Organization.findById(organizationId);
    if (!org) {
      return notFoundResponse('Organization not found');
    }

    if (name) org.name = name;
    if (industry) org.industry = industry;
    if (website !== undefined) org.website = website;

    if (country) {
      if (!org.address) org.address = {};
      org.address.country = country;
    }

    if (!org.settings) {
      org.settings = {
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        dateFormat: 'DD/MM/YYYY',
        language: 'en',
      };
    }

    if (currency) org.settings.currency = currency;
    if (timezone) org.settings.timezone = timezone;
    if (dateFormat) org.settings.dateFormat = dateFormat;
    if (language) org.settings.language = language;

    await org.save();

    return successResponse({
      id: org._id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      industry: org.industry,
      website: org.website,
      address: org.address,
      settings: org.settings,
      subscription: org.subscription,
    }, 'Organization settings updated successfully');
  } catch (error: any) {
    console.error('Update organization settings error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getSettingsHandler);
export const PATCH = withAuth(updateSettingsHandler);
