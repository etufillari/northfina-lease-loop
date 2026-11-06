// The event handlers a test runs with (docs/features/test-isolation.md, D37). The registry in
// src/server/events.ts is module state shared by every test in a file, and the services
// register the production handlers at import time, so which handlers a test saw used to depend
// on which modules its file imported. Each helper here clears the registry before and after
// every test and registers exactly the set it names. Only this file and events.test.ts call
// `clearHandlers` (tests/meta-rules.test.ts).
import { afterEach, beforeEach } from 'vitest';
import { handleContractSigned, handleExit } from '@/server/invoice-handlers';
import { returnLeasedAsset, sellLeasedAsset } from '@/server/catalogue-handlers';
import { clearHandlers, onEvent } from '@/server/events';
import { registerPassportHandlers } from '@/server/passport-handlers';

/**
 * The production wiring, in the order src/server/event-handlers.ts registers it: the invoices,
 * then the catalogue, then the passport. with-handlers.test.ts checks this list against the
 * `onEvent` lines of those modules, so a new production handler fails that test until added.
 */
export const PRODUCTION_WIRING = [
  { type: 'CONTRACT_SIGNED', module: 'invoice-handlers', handler: 'handleContractSigned' },
  { type: 'CONTRACT_BOUGHT_OUT', module: 'invoice-handlers', handler: 'handleExit' },
  { type: 'UNIT_RETURNED', module: 'invoice-handlers', handler: 'handleExit' },
  { type: 'UNIT_PASSED_ON', module: 'invoice-handlers', handler: 'handleExit' },
  { type: 'CONTRACT_BOUGHT_OUT', module: 'catalogue-handlers', handler: 'sellLeasedAsset' },
  { type: 'UNIT_RETURNED', module: 'catalogue-handlers', handler: 'returnLeasedAsset' },
  { type: 'UNIT_PASSED_ON', module: 'catalogue-handlers', handler: 'returnLeasedAsset' },
] as const;

/** Registers the production handlers once (the registry must be empty). */
export function registerProductionHandlers(): void {
  onEvent('CONTRACT_SIGNED', (tx, event) => handleContractSigned(tx, event));
  onEvent('CONTRACT_BOUGHT_OUT', (tx, event) => handleExit(tx, event));
  onEvent('UNIT_RETURNED', (tx, event) => handleExit(tx, event));
  onEvent('UNIT_PASSED_ON', (tx, event) => handleExit(tx, event));
  onEvent('CONTRACT_BOUGHT_OUT', (tx, event) => sellLeasedAsset(tx, event.assetId));
  onEvent('UNIT_RETURNED', (tx, event) => returnLeasedAsset(tx, event));
  onEvent('UNIT_PASSED_ON', (tx, event) => returnLeasedAsset(tx, event));
  registerPassportHandlers();
}

/** Every test in the calling file runs with exactly the handlers `register` adds (none by default). */
export function withHandlers(register: () => unknown = () => undefined): void {
  beforeEach(() => {
    clearHandlers();
    register();
  });
  afterEach(() => {
    clearHandlers();
  });
}

/** Every test in the calling file runs with the production handlers and nothing else. */
export function withProductionHandlers(): void {
  withHandlers(registerProductionHandlers);
}

/** Inside a test: empties the registry, for a test that then registers its own handlers. */
export function dropAllHandlers(): void {
  clearHandlers();
}
