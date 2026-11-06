// The audit page's Details column: a stored details value as one readable line per field.
import { describe, expect, it } from 'vitest';
import { auditDetailLines } from './details';

describe('auditDetailLines', () => {
  it('gives no lines for an entry without details', () => {
    expect(auditDetailLines(null)).toEqual([]);
    expect(auditDetailLines(undefined)).toEqual([]);
  });

  it('gives one line per field of a flat object, in stored order (a quote.created entry)', () => {
    expect(
      auditDetailLines({
        assetId: 'ebike-003',
        quantity: 1,
        termMonths: 36,
        monthlyNetCents: 10730,
        validUntil: '2026-11-19',
      })
    ).toEqual([
      { path: 'assetId', value: 'ebike-003' },
      { path: 'quantity', value: '1' },
      { path: 'termMonths', value: '36' },
      { path: 'monthlyNetCents', value: '10730' },
      { path: 'validUntil', value: '2026-11-19' },
    ]);
  });

  it('walks nested objects and arrays with a dotted path, array items counted from 1', () => {
    expect(
      auditDetailLines({
        decision: 'approved',
        reasons: [
          { code: 'too_young', params: { until: '2027-03-10' } },
          { code: 'manual_review' },
        ],
      })
    ).toEqual([
      { path: 'decision', value: 'approved' },
      { path: 'reasons.1.code', value: 'too_young' },
      { path: 'reasons.1.params.until', value: '2027-03-10' },
      { path: 'reasons.2.code', value: 'manual_review' },
    ]);
  });

  it('writes an empty object or array as a dash rather than dropping the field', () => {
    expect(auditDetailLines({ params: {}, reasons: [] })).toEqual([
      { path: 'params', value: '—' },
      { path: 'reasons', value: '—' },
    ]);
  });

  it('writes booleans and null as words, and keeps a string as it is, without quotes', () => {
    expect(auditDetailLines({ ok: true, by: null, note: 'say "hi"' })).toEqual([
      { path: 'ok', value: 'true' },
      { path: 'by', value: 'null' },
      { path: 'note', value: 'say "hi"' },
    ]);
  });

  it('gives a details value that is not an object one line with an empty path', () => {
    expect(auditDetailLines('reset')).toEqual([{ path: '', value: 'reset' }]);
    expect(auditDetailLines([1, 2])).toEqual([
      { path: '1', value: '1' },
      { path: '2', value: '2' },
    ]);
  });
});
