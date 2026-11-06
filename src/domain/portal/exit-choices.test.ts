import { describe, expect, it } from 'vitest';
import { endOfTermChoices } from './exit-choices';

// Card 1's contract: signed and started 5 Nov 2026, last day 4 Nov 2029.
const cardOne = { status: 'active', startDate: '2026-11-05', endDate: '2029-11-04' };

describe('endOfTermChoices', () => {
  it('card 1 on its first day: all three ways out, as an early exit before 4 Nov 2029', () => {
    expect(endOfTermChoices(cardOne, '2026-11-05')).toEqual({
      code: 'early_exit',
      params: { modes: ['buy', 'return', 'pass_on'], endDate: '2029-11-04' },
    });
  });

  it('card 8 on 5 Jun 2027: still an early exit', () => {
    expect(endOfTermChoices(cardOne, '2027-06-05').code).toBe('early_exit');
  });

  it('on the last day of the term and after it: the end-of-term choices', () => {
    expect(endOfTermChoices(cardOne, '2029-11-04')).toEqual({
      code: 'end_of_term',
      params: { modes: ['buy', 'return', 'pass_on'], endDate: '2029-11-04' },
    });
    expect(endOfTermChoices(cardOne, '2030-01-01').code).toBe('end_of_term');
  });

  it('the day before the term starts: no choice yet', () => {
    expect(endOfTermChoices(cardOne, '2026-11-04')).toEqual({
      code: 'not_started',
      params: { startDate: '2026-11-05' },
    });
  });

  it('card 8 after the exit: the contract has ended, no choice', () => {
    expect(endOfTermChoices({ ...cardOne, status: 'ended_early' }, '2027-06-05')).toEqual({
      code: 'contract_ended',
      params: { status: 'ended_early' },
    });
  });

  it('rejects a status that is not a contract status and a day that is not a day', () => {
    expect(() => endOfTermChoices({ ...cardOne, status: 'paused' }, '2027-01-01')).toThrow();
    expect(() => endOfTermChoices(cardOne, '2027-13-01')).toThrow(RangeError);
  });
});
