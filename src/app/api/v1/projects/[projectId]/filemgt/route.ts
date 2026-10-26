// =============================================================================
// InteriorOS Backend — Projects File Management (filemgt) API Routes
// =============================================================================

import { NextRequest } from 'next/server';
import { getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { ProjectFile } from '@/models/project-file.model';
import { successResponse, errorResponse, serverErrorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

// Recursively fetch parent breadcrumbs for a directory folder
async function getBreadcrumbs(folderId: string | mongoose.Types.ObjectId, organizationId: any): Promise<any[]> {
  const breadcrumbs: any[] = [];
  let currentId = folderId;

  while (currentId) {
    const folder = await ProjectFile.findOne({
      _id: currentId,
      organizationId,
      type: 'folder',
      isDeleted: false,
    });

    if (!folder) break;
    breadcrumbs.unshift({ _id: folder._id, name: folder.name });
    currentId = folder.parentId as any;
  }

  return breadcrumbs;
}

// GET /api/v1/projects/[projectId]/filemgt
// List files and folders inside a directory (parentId). Also retrieves folder breadcrumbs.
async function getFilesHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const { searchParams } = new URL(req.url);
    const parentIdParam = searchParams.get('parentId');

    let parentId: mongoose.Types.ObjectId | null = null;
    if (parentIdParam && parentIdParam !== 'null' && parentIdParam !== 'root' && parentIdParam !== '') {
      if (mongoose.Types.ObjectId.isValid(parentIdParam)) {
        parentId = new mongoose.Types.ObjectId(parentIdParam);
      } else {
        return errorResponse('Invalid parentId parameter', 400);
      }
    }

    // Query for files/folders at the current level
    const items = await ProjectFile.find({
      projectId,
      organizationId,
      parentId,
      isDeleted: false,
    })
      .populate('uploadedBy', 'firstName lastName')
      .sort({ type: 1, name: 1 }); // Folders first, then alphabetically

    // Fetch breadcrumbs if inside a folder
    let breadcrumbs: any[] = [];
    if (parentId) {
      breadcrumbs = await getBreadcrumbs(parentId, organizationId);
    }

    // Number of (non-deleted) files and sub-folders directly inside each folder
    const folderIds = items.filter((it: any) => it.type === 'folder').map((it: any) => it._id);
    const countMap = new Map<string, number>();
    if (folderIds.length > 0) {
      const counts = await ProjectFile.aggregate([
        {
          $match: {
            parentId: { $in: folderIds },
            organizationId: new mongoose.Types.ObjectId(String(organizationId)),
            isDeleted: false,
          },
        },
        { $group: { _id: '$parentId', count: { $sum: 1 } } },
      ]);
      counts.forEach((c: any) => countMap.set(String(c._id), c.count));
    }
    const itemsWithCounts = items.map((it: any) => {
      const obj = it.toObject();
      return it.type === 'folder' ? { ...obj, itemCount: countMap.get(String(it._id)) || 0 } : obj;
    });

    return successResponse({ items: itemsWithCounts, breadcrumbs });
  } catch (error) {
    console.error('GET filemgt error:', error);
    return serverErrorResponse();
  }
}

// POST /api/v1/projects/[projectId]/filemgt/folder
// Create a new folder
async function createFolderHandler(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
  auth: JwtPayload
) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    const body = await req.json();
    const { name, parentId: parentIdParam } = body;

    if (!name || name.trim() === '') {
      return errorResponse('Folder name is required', 400);
    }

    let parentId: mongoose.Types.ObjectId | null = null;
    if (parentIdParam && parentIdParam !== 'null' && parentIdParam !== 'root' && parentIdParam !== '') {
      if (mongoose.Types.ObjectId.isValid(parentIdParam)) {
        parentId = new mongoose.Types.ObjectId(parentIdParam);
      } else {
        return errorResponse('Invalid parentId parameter', 400);
      }
    }

    const folder = await ProjectFile.create({
      organizationId,
      projectId,
      name: name.trim(),
      type: 'folder',
      parentId,
      uploadedBy: auth.userId,
    });

    return successResponse(folder, 'Folder created successfully');
  } catch (error) {
    console.error('POST filemgt folder error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('filemgt', 'read', getFilesHandler);
export const POST = withProjectPermission('filemgt', 'create', createFolderHandler);
