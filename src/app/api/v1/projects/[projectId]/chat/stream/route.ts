// =============================================================================
// InteriorOS Backend — Chat SSE Stream
// =============================================================================

import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { authenticateRequest } from '@/middlewares/auth.middleware';
import { can } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<Record<string, string>> }) {
  const payload = await authenticateRequest(req);
  if (!payload) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { projectId } = await context.params;

  // Project chat is for this project's members (admins see every project)
  if (!(await can(payload, 'projects', 'read', projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const baseRedis = await getRedisClient();
  if (!baseRedis) {
    return new Response('Real-time chat is unavailable at the moment', { status: 503 });
  }

  const subscriber = baseRedis.duplicate();
  const channel = `project_chat:${projectId}`;

  const stream = new ReadableStream({
    async start(controller) {
      await subscriber.subscribe(channel, (err, count) => {
        if (err) {
          console.error('Failed to subscribe to chat channel:', err.message);
          controller.error(err);
        }
      });

      subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          // SSE format requires "data: <payload>\n\n"
          controller.enqueue(`data: ${message}\n\n`);
        }
      });

      // Send an initial heartbeat to establish connection
      controller.enqueue(':\n\n');

      // Setup keep-alive ping
      const interval = setInterval(() => {
        try {
          controller.enqueue(':\n\n'); // SSE comment, ignored by EventSource
        } catch (e) {
          clearInterval(interval);
        }
      }, 15000);

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        subscriber.unsubscribe(channel);
        subscriber.quit();
      });
    },
    cancel() {
      subscriber.unsubscribe(channel);
      subscriber.quit();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
