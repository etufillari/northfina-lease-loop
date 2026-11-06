import { describe, expect, it } from 'vitest';
import { contractRow } from '../../../tests/helpers/row-examples';
import { contractRowSchema } from './contract';

const refuses = (row: unknown) => contractRowSchema.safeParse(row).success === false;

describe('contractRowSchema: the signed lease, its prices copied from the quote', () => {
  it('accepts card 1: 36 months from 5 Nov 2026, last day 4 Nov 2029', () => {
    expect(contractRowSchema.parse(contractRow())).toEqual(contractRow());
  });

  it('holds the same money rules as the quote: financed = list × quantity − down', () => {
    expect(refuses({ ...contractRow(), financed_cents: 389001 })).toBe(true);
    expect(refuses({ ...contractRow(), monthly_net_cents: 10731 })).toBe(true);
  });

  it('refuses a status the contract does not have', () => {
    expect(refuses({ ...contractRow(), status: 'transferred' })).toBe(true);
  });

  it('refuses a start before the signing day', () => {
    expect(refuses({ ...contractRow(), start_date: '2026-11-04', end_date: '2029-11-03' })).toBe(
      true
    );
  });

  it('refuses an end that is not the last day of the term (D4)', () => {
    expect(refuses({ ...contractRow(), end_date: '2029-11-05' })).toBe(true);
    expect(refuses({ ...contractRow(), end_date: '2026-11-05' })).toBe(true);
  });

  it('clamps the end like the invoices: from 31 Jan 2026, 36 months end on 30 Jan 2029 (card 4)', () => {
    const row = {
      ...contractRow(),
      signed_on: '2026-01-31',
      start_date: '2026-01-31',
      end_date: '2029-01-30',
    };
    expect(contractRowSchema.safeParse(row).success).toBe(true);
  });

  it('an active contract has no end day, and an ended one has one', () => {
    expect(refuses({ ...contractRow(), ended_on: '2027-06-05' })).toBe(true);
    expect(refuses({ ...contractRow(), status: 'returned' })).toBe(true);
    expect(
      contractRowSchema.safeParse({
        ...contractRow(),
        status: 'ended_early',
        ended_on: '2027-06-05',
      }).success
    ).toBe(true);
  });

  it('refuses an end day before the start', () => {
    expect(refuses({ ...contractRow(), status: 'bought', ended_on: '2026-11-04' })).toBe(true);
  });

  it('refuses a contract that follows itself', () => {
    expect(refuses({ ...contractRow(), previous_contract_id: 'contract-1' })).toBe(true);
    expect(
      contractRowSchema.safeParse({ ...contractRow(), previous_contract_id: 'contract-0' }).success
    ).toBe(true);
  });
});
