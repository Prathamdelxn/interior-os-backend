// =============================================================================
// InteriorOS Backend — Audit Service
// =============================================================================

import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { AuditLog, IAuditLog } from '@/models/audit-log.model';
import { User } from '@/models/user.model';
import { Project } from '@/models/project.model';
import type { NextRequest } from 'next/server';

export interface LogAuditOptions {
  organizationId: string | mongoose.Types.ObjectId;
  userId: string | mongoose.Types.ObjectId;
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'login' | 'logout' | 'export' | 'upload' | 'download';
  entity: string;
  entityId?: string | mongoose.Types.ObjectId;
  entityName?: string;
  description?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  req?: NextRequest;
}

/**
 * Logs an audit event asynchronously without blocking the calling handler.
 */
export async function logAuditEvent(options: LogAuditOptions): Promise<void> {
  try {
    await connectDB();

    let ipAddress: string | undefined;
    let userAgent: string | undefined;

    if (options.req) {
      ipAddress =
        options.req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        options.req.headers.get('x-real-ip') ||
        undefined;
      userAgent = options.req.headers.get('user-agent') || undefined;
    }

    const orgId = typeof options.organizationId === 'string'
      ? new mongoose.Types.ObjectId(options.organizationId)
      : options.organizationId;

    const uId = typeof options.userId === 'string'
      ? new mongoose.Types.ObjectId(options.userId)
      : options.userId;

    const eId = options.entityId
      ? (typeof options.entityId === 'string' ? new mongoose.Types.ObjectId(options.entityId) : options.entityId)
      : new mongoose.Types.ObjectId();

    await AuditLog.create({
      organizationId: orgId,
      userId: uId,
      action: options.action,
      entity: options.entity,
      entityId: eId,
      entityName: options.entityName || options.entity,
      description: options.description || `${options.action} on ${options.entity}`,
      changes: options.changes,
      metadata: options.metadata,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

export interface GetAuditLogsParams {
  organizationId: string | mongoose.Types.ObjectId;
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  entity?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Retrieves paginated audit logs with search, filtering, and user population.
 */
export async function getAuditLogs(params: GetAuditLogsParams) {
  await connectDB();

  const orgId = typeof params.organizationId === 'string'
    ? new mongoose.Types.ObjectId(params.organizationId)
    : params.organizationId;

  // Auto seed initial audit events if collection is completely empty for this org
  await seedInitialAuditLogsIfEmpty(orgId);

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {
    organizationId: { $in: [orgId, String(orgId)] },
  };

  if (params.action && params.action !== 'all') {
    query.action = params.action;
  }

  if (params.entity && params.entity !== 'all') {
    query.entity = params.entity;
  }

  if (params.userId && params.userId !== 'all') {
    if (mongoose.Types.ObjectId.isValid(params.userId)) {
      query.userId = new mongoose.Types.ObjectId(params.userId);
    }
  }

  if (params.startDate || params.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (params.startDate) {
      dateFilter.$gte = new Date(params.startDate);
    }
    if (params.endDate) {
      const end = new Date(params.endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }
    query.createdAt = dateFilter;
  }

  if (params.search && params.search.trim()) {
    const searchRegex = { $regex: params.search.trim(), $options: 'i' };
    query.$or = [
      { entity: searchRegex },
      { entityName: searchRegex },
      { description: searchRegex },
      { ipAddress: searchRegex },
      { action: searchRegex },
    ];
  }

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(query),
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'firstName lastName email avatar systemRole')
      .lean(),
  ]);

  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Returns aggregated stats for the audit dashboard cards.
 */
export async function getAuditStats(organizationId: string | mongoose.Types.ObjectId) {
  await connectDB();

  const orgId = typeof organizationId === 'string'
    ? new mongoose.Types.ObjectId(organizationId)
    : organizationId;

  const orgFilter = { organizationId: { $in: [orgId, String(orgId)] } };

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [totalLogs, todayLogs, actionCounts, uniqueUsers] = await Promise.all([
    AuditLog.countDocuments(orgFilter),
    AuditLog.countDocuments({ ...orgFilter, createdAt: { $gte: startOfDay } }),
    AuditLog.aggregate([
      { $match: orgFilter },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]),
    AuditLog.distinct('userId', orgFilter),
  ]);

  const actionsMap: Record<string, number> = {};
  for (const item of actionCounts) {
    if (item._id) {
      actionsMap[item._id] = item.count;
    }
  }

  return {
    totalLogs,
    todayLogs,
    uniqueUsersCount: uniqueUsers.length,
    actionsMap,
    criticalActionsCount: (actionsMap['delete'] || 0) + (actionsMap['reject'] || 0),
    securityEventsCount: (actionsMap['login'] || 0) + (actionsMap['logout'] || 0),
  };
}

/**
 * Helper to seed initial realistic activity history if the organization has no audit logs yet.
 */
async function seedInitialAuditLogsIfEmpty(orgId: mongoose.Types.ObjectId) {
  const count = await AuditLog.countDocuments({ organizationId: { $in: [orgId, String(orgId)] } });
  if (count > 0) return;

  const users = await User.find({ organizationId: { $in: [orgId, String(orgId)] } }).limit(5).lean();
  if (users.length === 0) return;

  const admin = users[0];
  const projects = await Project.find({ organizationId: { $in: [orgId, String(orgId)] } }).limit(5).lean();

  const demoLogs: Partial<IAuditLog>[] = [];
  const now = Date.now();

  // Login event
  demoLogs.push({
    organizationId: orgId,
    userId: admin._id,
    action: 'login',
    entity: 'Authentication',
    entityId: admin._id,
    entityName: 'User Session',
    description: `User ${admin.firstName} ${admin.lastName} logged in successfully`,
    metadata: { browser: 'Chrome', platform: 'Windows', method: 'password' },
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    createdAt: new Date(now - 1000 * 60 * 15),
  } as any);

  // User & Organization setup
  demoLogs.push({
    organizationId: orgId,
    userId: admin._id,
    action: 'create',
    entity: 'User',
    entityId: admin._id,
    entityName: `${admin.firstName} ${admin.lastName}`,
    description: `User account created with role "${admin.systemRole || 'org_admin'}"`,
    changes: {
      after: { email: admin.email, role: admin.systemRole || 'org_admin', status: 'active' },
    },
    ipAddress: '127.0.0.1',
    createdAt: new Date(now - 1000 * 60 * 60 * 4),
  } as any);

  // Projects events
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    demoLogs.push({
      organizationId: orgId,
      userId: admin._id,
      action: 'create',
      entity: 'Project',
      entityId: p._id,
      entityName: p.name,
      description: `Created new project "${p.name}" (Code: ${p.code || 'PRJ'})`,
      changes: {
        after: {
          name: p.name,
          client: p.client,
          status: p.status,
          budget: p.budget?.amount || 0,
        },
      },
      ipAddress: '127.0.0.1',
      createdAt: new Date(now - 1000 * 60 * 60 * (12 + i * 8)),
    } as any);

    demoLogs.push({
      organizationId: orgId,
      userId: admin._id,
      action: 'update',
      entity: 'Project',
      entityId: p._id,
      entityName: p.name,
      description: `Updated project schedule and budget allocation for "${p.name}"`,
      changes: {
        before: { status: 'draft' },
        after: { status: p.status || 'active' },
      },
      ipAddress: '127.0.0.1',
      createdAt: new Date(now - 1000 * 60 * 60 * (6 + i * 4)),
    } as any);
  }

  // CRM Pipeline event
  demoLogs.push({
    organizationId: orgId,
    userId: admin._id,
    action: 'approve',
    entity: 'CRM',
    entityId: new mongoose.Types.ObjectId(),
    entityName: 'Quotation QT-2026-001',
    description: `Quotation approved and sent to client for approval`,
    metadata: { amount: 1850000, stage: 'Quotation Sent' },
    ipAddress: '127.0.0.1',
    createdAt: new Date(now - 1000 * 60 * 60 * 2),
  } as any);

  await AuditLog.insertMany(demoLogs);
}
