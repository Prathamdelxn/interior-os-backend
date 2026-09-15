// =============================================================================
// InteriorOS Backend — Projects 3D Model Upload API Route
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/project.model';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { successResponse, errorResponse, serverErrorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import * as fs from 'fs';
import * as path from 'path';

async function uploadModelHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  _auth: JwtPayload
) {
  try {
    await connectDB();
    const { projectId } = await context.params;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    // Limit size to 25MB (26,214,400 bytes)
    if (file.size > 26214400) {
      return errorResponse('File size exceeds the 25MB limit', 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = file.name || 'model.glb';

    // Verify it is a glb file
    if (!filename.endsWith('.glb')) {
      return errorResponse('Only .glb file format is supported', 400);
    }

    let fileUrl = '';
    
    // Check if Cloudinary is configured
    const isCloudinaryConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );

    if (isCloudinaryConfigured) {
      fileUrl = await uploadToCloudinary(buffer, 'models', filename);
    } else {
      // Local file fallback
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'models');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const filePath = path.join(uploadDir, safeFilename);
      fs.writeFileSync(filePath, buffer);
      
      const host = req.headers.get('host') || 'localhost:3000';
      const proto = req.headers.get('x-forwarded-proto') || 'http';
      fileUrl = `${proto}://${host}/uploads/models/${safeFilename}`;
    }

    // Save url in project document
    const project = await Project.findByIdAndUpdate(
      projectId,
      { $set: { threeDModelUrl: fileUrl } },
      { returnDocument: 'after' }
    );

    if (!project) {
      return notFoundResponse('Project not found');
    }

    return successResponse({ url: fileUrl, project }, '3D Model uploaded successfully');
  } catch (error) {
    console.error('3D Model upload API error:', error);
    return serverErrorResponse();
  }
}

export const POST = withAuth(uploadModelHandler);
