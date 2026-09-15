// =============================================================================
// InteriorOS Backend — Audit Logs API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { getAuditLogs, getAuditStats, logAuditEvent } from '@/services/audit.service';
import {
  successResponse,
  serverErrorResponse,
  forbiddenResponse,
  createdResponse,
  parsePaginationParams,
  buildPaginationMeta,
} from '@/lib/api-response';
import { connectDB } from '@/lib/db';
import { User } from '@/models/user.model';
import type { JwtPayload } from '@/lib/jwt';

// GET: Retrieve paginated audit logs and summary statistics (Admin only)
async function getAuditLogsHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    const isSuperAdmin = auth.systemRole === 'super_admin';
    const isOrgAdmin = auth.systemRole === 'org_admin' || auth.systemRole === 'admin';

    if (!isSuperAdmin && !isOrgAdmin) {
      await connectDB();
      const user = await User.findById(auth.userId).populate('role').lean();
      const roleSlug = ((user?.role as any)?.slug || '').toLowerCase();
      const roleName = ((user?.role as any)?.name || '').toLowerCase();
      const isAdminRole =
        roleSlug === 'admin' ||
        roleSlug === 'org_admin' ||
        roleSlug === 'super_admin' ||
        roleName === 'admin' ||
        roleName === 'org admin' ||
        roleName === 'super admin';

      if (!isAdminRole) {
        return forbiddenResponse('Access denied. Only administrators can view audit logs.');
      }
    }

    const organizationId = getOrganizationId(auth);
    const searchParams = req.nextUrl.searchParams;
    const { page, limit } = parsePaginationParams(searchParams);

    const search = searchParams.get('search') || '';
    const action = searchParams.get('action') || '';
    const entity = searchParams.get('entity') || '';
    const userId = searchParams.get('userId') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const [logsResult, stats] = await Promise.all([
      getAuditLogs({
        organizationId,
        page,
        limit,
        search,
        action,
        entity,
        userId,
        startDate,
        endDate,
      }),
      getAuditStats(organizationId),
    ]);

    const meta = buildPaginationMeta(logsResult.total, page, limit);

    return successResponse({
      logs: logsResult.logs,
      meta,
      stats,
    });
  } catch (error) {
    console.error('Audit logs API error:', error);
    return serverErrorResponse();
  }
}

// POST: Manually record a client or system audit event
async function createAuditLogHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    const { action, entity, entityId, entityName, description, changes, metadata } = body;

    if (!action || !entity) {
      return serverErrorResponse('Action and entity are required');
    }

    await logAuditEvent({
      organizationId,
      userId: auth.userId,
      action,
      entity,
      entityId,
      entityName,
      description,
      changes,
      metadata,
      req,
    });

    return createdResponse({ recorded: true }, 'Audit event recorded successfully');
  } catch (error) {
    console.error('Record audit log error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getAuditLogsHandler);
export const POST = withAuth(createAuditLogHandler);
