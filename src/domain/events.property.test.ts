// Property test of the event date validator: every real day of 1990–2099 passes, month 13 and
// day 32 never do. Also the first use of fast-check (smart problem 5's property tests use it).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { eventDateSchema } from './events';

const MIN = Date.UTC(1990, 0, 1);
const MAX = Date.UTC(2099, 11, 31);
const DAY_MS = 86_400_000;

/** Any real calendar day from 1990-01-01 to 2099-12-31, as `YYYY-MM-DD`. */
const realDay = fc
  .integer({ min: 0, max: (MAX - MIN) / DAY_MS })
  .map((offset) => new Date(MIN + offset * DAY_MS).toISOString().slice(0, 10));

const year = fc.integer({ min: 1990, max: 2099 }).map(String);
const pad = (n: number) => String(n).padStart(2, '0');

describe('eventDateSchema (property)', () => {
  it('accepts every real day of 1990–2099', () => {
    fc.assert(
      fc.property(realDay, (day) => {
        expect(eventDateSchema.safeParse(day).success).toBe(true);
      }),
      { numRuns: 2000 }
    );
  });

  it('rejects month 13', () => {
    fc.assert(
      fc.property(year, fc.integer({ min: 1, max: 31 }), (y, d) => {
        expect(eventDateSchema.safeParse(`${y}-13-${pad(d)}`).success).toBe(false);
      })
    );
  });

  it('rejects day 32', () => {
    fc.assert(
      fc.property(year, fc.integer({ min: 1, max: 12 }), (y, m) => {
        expect(eventDateSchema.safeParse(`${y}-${pad(m)}-32`).success).toBe(false);
      })
    );
  });
});
