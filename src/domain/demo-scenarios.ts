// The judges' scenario cards (CHALLENGE.md §4) as data: on which demo date each one starts and which
// page it opens (D-058). It holds starting points only, never results: the app computes every
// answer, so the 3 surprise cards run through exactly the same code.
import { AS_OF_MAX } from './as-of';
import { addMonthsClamped } from './calendar';

/** Where a step starts. Contract and quote ids only exist in the database, so the server finds them. */
export type ScenarioTarget =
  | { kind: 'asset'; assetId: string }
  | { kind: 'passport'; assetId: string }
  /** The newest contract on this item (for this customer, in this status) that hasn't ended. */
  | {
      kind: 'contract';
      assetId: string;
      customerId?: string;
      status: 'active' | 'awaiting_signatory';
    }
  /** The newest quote on this item that hasn't been signed. */
  | { kind: 'open_quote'; assetId: string };

/** One click: set the demo date, then open a page. */
export interface ScenarioStep {
  /** The demo date (`YYYY-MM-DD`) to set first. */
  asOf: string;
  target: ScenarioTarget;
}

export interface DemoScenario {
  card: number;
  /** Message keys `demo.card.<key>.title` and `demo.card.<key>.look`, and `.step<n>` per step. */
  key: string;
  /** The decisions behind the card, for the pitch and the judges. */
  decisions: readonly string[];
  steps: readonly ScenarioStep[];
}

const THURSDAY = '2026-11-05';
const FRIDAY = '2026-11-06';

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    card: 1,
    key: 'happyPath',
    decisions: ['D-011', 'D-016', 'D-037'],
    steps: [{ asOf: THURSDAY, target: { kind: 'asset', assetId: 'ebike-003' } }],
  },
  {
    card: 2,
    key: 'priceLock',
    decisions: ['D-014', 'D-034'],
    steps: [
      { asOf: THURSDAY, target: { kind: 'asset', assetId: 'laptop-004' } },
      { asOf: FRIDAY, target: { kind: 'open_quote', assetId: 'laptop-004' } },
    ],
  },
  {
    card: 3,
    key: 'taxNotPrice',
    decisions: ['D-011'],
    steps: [{ asOf: '2026-09-15', target: { kind: 'asset', assetId: 'ebike-001' } }],
  },
  {
    card: 4,
    key: 'calendar',
    decisions: ['D-015', 'D-016'],
    steps: [{ asOf: '2026-01-31', target: { kind: 'asset', assetId: 'laptop-001' } }],
  },
  {
    card: 5,
    key: 'tooYoung',
    decisions: ['D-028'],
    steps: [{ asOf: THURSDAY, target: { kind: 'asset', assetId: 'laptop-008' } }],
  },
  {
    card: 6,
    key: 'whoCanSign',
    decisions: ['D-024', 'D-048', 'D-053'],
    steps: [
      { asOf: THURSDAY, target: { kind: 'asset', assetId: 'ebike-004' } },
      {
        asOf: '2026-11-20',
        target: { kind: 'contract', assetId: 'ebike-004', status: 'awaiting_signatory' },
      },
    ],
  },
  {
    card: 7,
    key: 'bigTicket',
    decisions: ['D-022', 'D-037', 'D-041'],
    steps: [{ asOf: THURSDAY, target: { kind: 'asset', assetId: 'farm-002' } }],
  },
  {
    card: 8,
    key: 'earlyExit',
    decisions: ['D-033', 'D-039', 'D-045'],
    steps: [
      {
        asOf: '2027-05-05',
        target: {
          kind: 'contract',
          assetId: 'ebike-003',
          customerId: 'cust-aino',
          status: 'active',
        },
      },
    ],
  },
  {
    card: 9,
    key: 'secondLife',
    decisions: ['D-032', 'D-035'],
    steps: [{ asOf: FRIDAY, target: { kind: 'asset', assetId: 'ebike-007' } }],
  },
  {
    card: 10,
    key: 'thirdLife',
    decisions: ['D-035', 'D-036'],
    steps: [
      { asOf: FRIDAY, target: { kind: 'asset', assetId: 'ebike-008' } },
      { asOf: FRIDAY, target: { kind: 'passport', assetId: 'ebike-008' } },
    ],
  },
];

/**
 * The link for a step whose page needs no database lookup. Contract and quote targets give null:
 * the server resolves them (`resolveScenarioTarget` in `src/server/demo-panel.ts`).
 */
export function scenarioHref(step: ScenarioStep, locale: string): string | null {
  const { target } = step;
  if (target.kind === 'asset') return `/${locale}/assets/${target.assetId}`;
  if (target.kind === 'passport') return `/${locale}/assets/${target.assetId}/passport`;
  return null;
}

/**
 * Moves the demo date forward by whole months, clamped to a real month end (D-016) and to the last
 * allowed demo date. Only forward: the header's Back to today goes the other way.
 */
export function shiftAsOf(isoDate: string, by: { months: number }): string {
  const moved = addMonthsClamped(isoDate, by.months);
  return moved > AS_OF_MAX ? AS_OF_MAX : moved;
}
