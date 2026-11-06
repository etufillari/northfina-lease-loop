// Passes notifications to whoever is connected right now. Nothing is stored, so someone who is
// offline misses it. It lives in this one server's memory, which suits one long-running server.
// `next dev` and instrumentation can load this file twice, so the emitter is kept on globalThis.
import { EventEmitter } from 'node:events';
import type { AddressedNotification, AppNotification } from '@/domain/notifications';

const shared = globalThis as typeof globalThis & { notificationBus?: EventEmitter };

function bus(): EventEmitter {
  if (!shared.notificationBus) {
    shared.notificationBus = new EventEmitter();
    // One listener per address per open tab, so the default warning at 10 means nothing here.
    shared.notificationBus.setMaxListeners(0);
  }
  return shared.notificationBus;
}

export function publish({ to, ...notification }: AddressedNotification): void {
  bus().emit(to, notification);
}

/** Listens on every address, and returns a function that stops listening. */
export function subscribe(
  addresses: readonly string[],
  listener: (notification: AppNotification) => void
): () => void {
  for (const address of addresses) bus().on(address, listener);
  return () => {
    for (const address of addresses) bus().off(address, listener);
  };
}
