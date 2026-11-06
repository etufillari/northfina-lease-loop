// The in-transaction event bus (docs/kickoff-brief.md section 7). A slice that changes
// several slices' rows at one instant emits one event with the `tx` that `withAudit` gave it;
// the other slices register handlers at import time. Handlers run in registration order, each
// awaited, on the same `tx`, so their writes commit or roll back with the change. A handler
// that throws aborts the whole transaction. No queue, no retries.
//
//   await withAudit(db, entry, async (tx) => {
//     const contract = await tx.contract.create({ data });
//     await emit(tx, { type: 'CONTRACT_SIGNED', contractId: contract.id, ... });
//     return contract;
//   });
import { domainEventSchema, type DomainEvent, type EventOf, type EventType } from '@/domain/events';
import type { TransactionClient } from './audit';

export type EventHandler<T extends EventType> = (
  tx: TransactionClient,
  event: EventOf<T>
) => Promise<unknown>;

type AnyHandler = (tx: TransactionClient, event: DomainEvent) => Promise<unknown>;

const handlers = new Map<EventType, AnyHandler[]>();

/** Registers `handler` for events of `type`. Returns a function that removes it again. */
export function onEvent<T extends EventType>(type: T, handler: EventHandler<T>): () => void {
  const wrapped = handler as AnyHandler;
  handlers.set(type, [...(handlers.get(type) ?? []), wrapped]);
  return () => {
    handlers.set(
      type,
      (handlers.get(type) ?? []).filter((registered) => registered !== wrapped)
    );
  };
}

/**
 * Validates `event` and runs every handler of its type on `tx`, in order. Call it inside
 * `withAudit` with the `tx` you were given; an invalid payload or a throwing handler
 * rejects, and `withAudit` rolls the change back.
 */
export async function emit(tx: TransactionClient, event: DomainEvent): Promise<void> {
  const parsed = domainEventSchema.parse(event);
  for (const handler of handlers.get(parsed.type) ?? []) {
    await handler(tx, parsed);
  }
}

/** Removes every handler. For tests. */
export function clearHandlers(): void {
  handlers.clear();
}
