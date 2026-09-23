// =============================================================================
// InteriorOS Backend — Public CRM Drawing Portal API
// Unauthenticated endpoint for external clients to view shared drawings & design files
// =============================================================================

import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { CrmCustomer } from '@/models/crm-customer.model';
import { Organization } from '@/models/organization.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';

export async function GET(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  try {
    await connectDB();
    const { token } = await context.params;

    if (!token) {
      return errorResponse('Missing share token', 400);
    }

    const customer = await CrmCustomer.findOne({
      'shareSettings.shareToken': token,
      'shareSettings.isPublic': true,
    }).populate('organizationId', 'name logo email phone website');

    if (!customer) {
      return errorResponse('Drawing share link is invalid or has been disabled.', 404);
    }

    // Check expiration
    if (customer.shareSettings?.expiresAt && new Date() > new Date(customer.shareSettings.expiresAt)) {
      return errorResponse('This drawing share link has expired.', 410);
    }

    // Increment view count asynchronously
    await CrmCustomer.updateOne(
      { _id: customer._id },
      {
        $inc: { 'shareSettings.viewCount': 1 },
        $set: { 'shareSettings.lastViewedAt': new Date() },
      }
    );

    const org = customer.organizationId as any;

    // Filter to strictly only include internally approved drawings for client viewing
    const approvedDesignFiles = (customer.designFiles || []).filter((d: any) => {
      const versions = d.versions || [];
      const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
      const status = d.status || d.approvalStatus || latestVersion?.approvalStatus;

      // Must be explicitly internally_approved, client_approved, or client_changes_requested
      const isStatusApproved = ['internally_approved', 'client_approved', 'client_changes_requested'].includes(status);
      const hasApprovedVersion = versions.some((v: any) => v.approvalStatus === 'internally_approved');

      return isStatusApproved || hasApprovedVersion;
    }).map((d: any) => {
      // Get the latest approved version
      const approvedVersion = (d.versions || [])
        .filter((v: any) => v.approvalStatus === 'internally_approved')
        .pop();

      return {
        _id: d._id,
        name: approvedVersion ? approvedVersion.name : (d.title || d.name),
        title: d.title || (approvedVersion ? approvedVersion.name : d.name),
        url: approvedVersion ? approvedVersion.url : d.url,
        fileType: approvedVersion ? approvedVersion.fileType : (d.fileType || 'image'),
        category: approvedVersion ? approvedVersion.category : (d.category || '2D'),
        discipline: d.discipline || 'Architectural',
        roomTag: d.roomTag,
        versionNumber: approvedVersion ? approvedVersion.versionNumber : (d.currentVersion || 1),
        currentVersion: d.currentVersion || 1,
        status: approvedVersion ? 'internally_approved' : (d.status || 'internally_approved'),
        clientStatus: approvedVersion?.clientStatus || d.clientStatus || 'pending_client_review',
        clientFeedback: approvedVersion?.clientFeedback || d.clientFeedback || '',
        uploadedAt: approvedVersion ? approvedVersion.uploadedAt : (d.uploadedAt || new Date()),
        versions: (d.versions || [])
          .filter((v: any) => v.approvalStatus === 'internally_approved')
          .map((v: any) => ({
            versionNumber: v.versionNumber,
            name: v.name,
            url: v.url,
            fileType: v.fileType,
            category: v.category,
            approvalStatus: v.approvalStatus,
            clientStatus: v.clientStatus,
            clientFeedback: v.clientFeedback,
            uploadedAt: v.uploadedAt,
          })),
      };
    });

    return successResponse({
      lead: {
        id: customer._id,
        name: customer.name,
        leadNumber: customer.leadNumber,
        propertyType: customer.propertyType,
        projectLocation: customer.projectLocation,
        city: customer.city,
        state: customer.state,
      },
      organization: {
        name: org?.name || 'SkyStruct Lite',
        logo: org?.logo || null,
        email: org?.email || null,
        phone: org?.phone || null,
        website: org?.website || null,
      },
      designFiles: approvedDesignFiles,
      requirements: customer.shareSettings?.includeRequirements ? (customer.requirements || []) : [],
      permissions: {
        allowDownload: customer.shareSettings?.allowDownload ?? true,
        expiresAt: customer.shareSettings?.expiresAt || null,
      },
    });
  } catch (error) {
    console.error('Error in public CRM drawing share API:', error);
    return serverErrorResponse('Failed to retrieve drawing data');
  }
}
