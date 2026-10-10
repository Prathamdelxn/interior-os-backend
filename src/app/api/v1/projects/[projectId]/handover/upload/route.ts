// =============================================================================
// InteriorOS Backend — Handover Documents Upload API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth.middleware';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

async function uploadHandoverDocumentHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let buffer: Buffer;
    let filename = 'document.pdf';

    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return errorResponse('No file provided in form data', 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      filename = file.name || 'document.pdf';
    } else {
      const body = await req.json().catch(() => ({}));
      if (body.base64) {
        const base64Data = body.base64.replace(/^data:.*?;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
        filename = body.filename || 'document.pdf';
      } else {
        return errorResponse('Content-Type must be multipart/form-data or include base64 payload', 400);
      }
    }

    // Upload to Cloudinary inside handover folder
    const secureUrl = await uploadToCloudinary(buffer, 'handover', filename);

    return successResponse({ url: secureUrl }, 'Document uploaded successfully');
  } catch (error) {
    console.error('Handover document upload API error:', error);
    return serverErrorResponse();
  }
}

export const POST = withAuth(uploadHandoverDocumentHandler);
