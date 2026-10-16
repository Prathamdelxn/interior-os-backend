// =============================================================================
// InteriorOS Backend — Drawings Upload API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

async function uploadDrawingHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = file.name || 'drawing.pdf';

    // Upload to Cloudinary inside drawings folder
    const secureUrl = await uploadToCloudinary(buffer, 'drawings', filename);

    return successResponse({ url: secureUrl }, 'File uploaded successfully');
  } catch (error) {
    console.error('Drawing upload API error:', error);
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('drawings', 'create', uploadDrawingHandler);
