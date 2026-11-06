// Rewinding the demo clock (demo mode only): moving the date back undoes the demo actions that
// happened after it, so a presenter can show a scenario again from an earlier day. Pure: it
// decides what to undo for each contract; the server makes the changes in one audited step.

export type RewindContract = {
  id: string;
  isDemo: boolean;
  status: string;
  startDate: string;
  endedOn: string | null;
  signatoryEmail: string | null;
  signedOn: string | null;
};

/**
 * - `remove`: the lease started after the date, so it didn't exist yet.
 * - `unsign`: the company's signatory signed after the date; it waits for them again.
 * - `unbuy`: it was bought after the date; it's an active lease again.
 * - `trim`: it existed; only invoices, payments and events after the date are undone.
 * Real (non-demo) leases are never touched. A return completed after the date is only
 * trimmed: its inspection already changed the item, so it isn't undone.
 */
export type RewindStep = 'remove' | 'unsign' | 'unbuy' | 'trim';

export function rewindStep(contract: RewindContract, date: string): RewindStep | null {
  if (!contract.isDemo) return null;
  if (contract.signatoryEmail && contract.signedOn && contract.signedOn > date) return 'unsign';
  if (contract.startDate > date) return 'remove';
  if (contract.status === 'bought' && contract.endedOn && contract.endedOn > date) return 'unbuy';
  return 'trim';
}
