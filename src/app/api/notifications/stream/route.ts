// GET /api/notifications/stream
// A Server-Sent Events stream of this person's notifications while they have the app open.
// It is the one route without the `ok()` envelope, because SSE is a stream and not one JSON
// reply. A failed login happens before the stream starts, so it still answers with `fail()`.
import { identitySummary } from '@/domain/identity';
import { notificationAddresses } from '@/domain/notifications';
import { handleRoute } from '@/server/api-response';
import { requireActor } from '@/server/auth/actor';
import { subscribe } from '@/server/notifications/bus';

/** A comment line now and then keeps idle connections from being closed. */
const HEARTBEAT_MS = 25_000;

export const GET = handleRoute(async (request) => {
  const actor = await requireActor();
  const addresses = notificationAddresses(identitySummary(actor));
  const encoder = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // A tab that just closed makes this throw. It must never reach the change being published.
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };

      const unsubscribe = subscribe(addresses, (notification) =>
        send(`data: ${JSON.stringify(notification)}\n\n`)
      );
      const heartbeat = setInterval(() => send(': heartbeat\n\n'), HEARTBEAT_MS);
      heartbeat.unref();

      stop = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      request.signal.addEventListener('abort', () => {
        stop();
        try {
          controller.close();
        } catch {
          // Already closed by the other side.
        }
      });

      // Sent at once, so the connection opens without waiting for the first message.
      send(': connected\n\n');
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      // `no-transform` stops compression from holding messages back.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});
