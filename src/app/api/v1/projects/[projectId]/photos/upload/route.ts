// =============================================================================
// InteriorOS Backend — Photos Upload API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

async function uploadPhotoHandler(
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
    const filename = file.name || 'photo.jpg';

    // Upload to Cloudinary inside photos folder
    const secureUrl = await uploadToCloudinary(buffer, 'photos', filename);

    return successResponse({ url: secureUrl }, 'Photo uploaded successfully');
  } catch (error) {
    console.error('Photo upload API error:', error);
    return serverErrorResponse();
  }
}

export const POST = withProjectPermission('photos', 'create', uploadPhotoHandler);
