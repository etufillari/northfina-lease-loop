// The passport's event handlers: every lease, return, buyout and pass-on writes one row to
// the asset's event log, inside the transaction of the change (src/server/events.ts).
// Registered once at startup by src/server/event-handlers.ts.
import type { EventType } from '@/domain/events';
import type { AssetEventKind } from '@/domain/statuses';
import { appendAssetEvent } from './asset-events';
import { onEvent } from './events';

/** Which log entry each event writes. */
export const PASSPORT_EVENT_KINDS = {
  CONTRACT_SIGNED: 'leased',
  UNIT_RETURNED: 'returned',
  CONTRACT_BOUGHT_OUT: 'bought',
  UNIT_PASSED_ON: 'passed_on',
} as const satisfies Partial<Record<EventType, AssetEventKind>>;

/** Registers the handlers. Returns a function that removes them again (for tests). */
export function registerPassportHandlers(): () => void {
  const off = [
    onEvent('CONTRACT_SIGNED', (tx, event) =>
      appendAssetEvent(tx, {
        assetId: event.assetId,
        contractId: event.contractId,
        kind: PASSPORT_EVENT_KINDS.CONTRACT_SIGNED,
        onDate: event.startDate,
        details: {
          customerId: event.customerId,
          termMonths: event.termMonths,
          endDate: event.endDate,
        },
      })
    ),
    onEvent('UNIT_RETURNED', (tx, event) =>
      appendAssetEvent(tx, {
        assetId: event.assetId,
        contractId: event.contractId,
        kind: PASSPORT_EVENT_KINDS.UNIT_RETURNED,
        onDate: event.date,
        details: { reason: event.reason, condition: event.condition, usage: event.usage },
      })
    ),
    onEvent('CONTRACT_BOUGHT_OUT', (tx, event) =>
      appendAssetEvent(tx, {
        assetId: event.assetId,
        contractId: event.contractId,
        kind: PASSPORT_EVENT_KINDS.CONTRACT_BOUGHT_OUT,
        onDate: event.date,
        details: { amountCents: event.amountCents },
      })
    ),
    onEvent('UNIT_PASSED_ON', (tx, event) =>
      appendAssetEvent(tx, {
        assetId: event.assetId,
        contractId: event.contractId,
        kind: PASSPORT_EVENT_KINDS.UNIT_PASSED_ON,
        onDate: event.date,
        details: {
          reason: event.reason,
          condition: event.condition,
          usage: event.usage,
          nextCustomerId: event.nextCustomerId,
        },
      })
    ),
  ];
  return () => off.forEach((remove) => remove());
}
