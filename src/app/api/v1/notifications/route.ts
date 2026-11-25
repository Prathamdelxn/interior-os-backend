// =============================================================================
// InteriorOS Backend — the signed-in user's in-app notifications (header bell)
//   GET    ?limit=30          → { items, unreadCount }
//   PATCH  { ids: [...] }     → mark those read
//   PATCH  { all: true }      → mark everything read
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Notification } from '@/models/notification.model';
import { successResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

type Ctx = { params: Promise<Record<string, string>> };

async function list(req: NextRequest, _ctx: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 30));
    const mine = { userId: auth.userId, isArchived: { $ne: true } };
    const [items, unreadCount] = await Promise.all([
      Notification.find(mine)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('type category title body actionUrl actionLabel isRead createdAt sender')
        .populate('sender', 'firstName lastName')
        .lean(),
      Notification.countDocuments({ ...mine, isRead: false }),
    ]);
    return successResponse({ items, unreadCount });
  } catch (e) {
    console.error('List notifications error:', e);
    return serverErrorResponse();
  }
}

async function markRead(req: NextRequest, _ctx: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const filter: Record<string, unknown> = { userId: auth.userId, isRead: false };
    if (!body.all) {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : [];
      if (!ids.length) return successResponse({ updated: 0 });
      filter._id = { $in: ids };
    }
    const r = await Notification.updateMany(filter, { $set: { isRead: true, readAt: new Date() } });
    return successResponse({ updated: r.modifiedCount });
  } catch (e) {
    console.error('Mark notifications read error:', e);
    return serverErrorResponse();
  }
}

export const GET = withAuth(list);
export const PATCH = withAuth(markRead);
