// =============================================================================
// InteriorOS Backend — in-app notifications (the header bell)
//
// Writes Notification documents for users. Never throws: a failed notification
// must not fail the action that triggered it (raising an RFI, assigning it…).
// Notifications expire after 90 days (TTL index on the model).
// =============================================================================

import { Notification } from '@/models/notification.model';

export interface NotifyInput {
  organizationId: string;
  /** Recipients; duplicates and the sender are removed automatically. */
  userIds: Array<string | { toString(): string } | null | undefined>;
  category: 'project' | 'task' | 'milestone' | 'rfi' | 'snag' | 'ncr' | 'procurement' | 'drawing' | 'dpr' | 'mom' | 'risk' | 'handover' | 'user' | 'system';
  type?: 'info' | 'success' | 'warning' | 'error' | 'action_required';
  title: string;
  body: string;
  /** App path to open, e.g. /interior-new/projects/<id>/rfis?rfi=<id> */
  actionUrl?: string;
  actionLabel?: string;
  sender?: string;
  related?: { type: string; id: string };
}

export async function notifyUsers(input: NotifyInput): Promise<void> {
  try {
    const sender = input.sender ? String(input.sender) : '';
    const ids = [...new Set(input.userIds.filter(Boolean).map((u) => String(u)))].filter((id) => id !== sender);
    if (!ids.length) return;
    await Notification.insertMany(
      ids.map((userId) => ({
        organizationId: input.organizationId,
        userId,
        category: input.category,
        type: input.type || 'info',
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 500),
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel,
        sender: sender || undefined,
        relatedEntity: input.related,
      })),
      { ordered: false }
    );
  } catch (e: any) {
    console.error('notifyUsers failed', e?.message || e);
  }
}
