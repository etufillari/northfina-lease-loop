import { describe, expect, it } from 'vitest';
import { getEndOfTermChoices, getRemainingMonths } from './end-of-term-options';

describe('getRemainingMonths', () => {
  it('counts full lease months remaining at a period boundary', () => {
    expect(getRemainingMonths('2026-11-05', '2026-11-05', 36)).toEqual({
      ok: true,
      months: 36,
    });
    expect(getRemainingMonths('2026-12-05', '2026-11-05', 36)).toEqual({
      ok: true,
      months: 35,
    });
  });

  it('keeps the current partial billing period in the remaining count', () => {
    expect(getRemainingMonths('2026-11-06', '2026-11-05', 36)).toEqual({
      ok: true,
      months: 36,
    });
  });

  it('returns zero at and after lease end', () => {
    expect(getRemainingMonths('2029-11-05', '2026-11-05', 36)).toEqual({
      ok: true,
      months: 0,
    });
    expect(getRemainingMonths('2029-11-06', '2026-11-05', 36)).toEqual({
      ok: true,
      months: 0,
    });
  });

  it('handles month-end anniversaries without drift', () => {
    expect(getRemainingMonths('2026-02-28', '2026-01-31', 12)).toEqual({
      ok: true,
      months: 11,
    });
  });

  it('rejects invalid dates and terms', () => {
    expect(getRemainingMonths('bad', '2026-11-05', 36)).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
    expect(getRemainingMonths('2026-11-05', '2026-11-05', 0)).toEqual({
      ok: false,
      reason: 'invalid_term',
    });
  });
});

describe('getEndOfTermChoices', () => {
  it('offers buy and early termination when more than one month remains', () => {
    expect(getEndOfTermChoices('2029-10-04', '2029-11-05', true)).toEqual({
      ok: true,
      choices: ['buy', 'endEarly'],
    });
  });

  it('treats the one-month boundary as the final month and requires payment', () => {
    expect(getEndOfTermChoices('2029-10-05', '2029-11-05', true)).toEqual({
      ok: true,
      choices: ['return', 'extend', 'buy'],
    });
    expect(getEndOfTermChoices('2029-10-05', '2029-11-05', false)).toEqual({
      ok: true,
      choices: ['buy', 'endEarly'],
    });
  });

  it('only offers return and extend in the final month after the latest invoice is paid', () => {
    expect(getEndOfTermChoices('2029-10-20', '2029-11-05', true)).toEqual({
      ok: true,
      choices: ['return', 'extend', 'buy'],
    });
    expect(getEndOfTermChoices('2029-10-20', '2029-11-05', false)).toEqual({
      ok: true,
      choices: ['buy', 'endEarly'],
    });
  });

  it('offers no end-of-term choices once the lease has ended', () => {
    expect(getEndOfTermChoices('2029-11-05', '2029-11-05', true)).toEqual({
      ok: true,
      choices: [],
    });
  });

  it('clamps the final-month boundary for dates at the end of a month', () => {
    expect(getEndOfTermChoices('2028-02-29', '2028-03-31', true)).toEqual({
      ok: true,
      choices: ['return', 'extend', 'buy'],
    });
    expect(getEndOfTermChoices('2028-02-28', '2028-03-31', true)).toEqual({
      ok: true,
      choices: ['buy', 'endEarly'],
    });
  });

  it('rejects invalid dates', () => {
    expect(getEndOfTermChoices('2029-02-29', '2029-03-31', true)).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
    expect(getEndOfTermChoices('2029-01-01', 'bad', true)).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });
});
