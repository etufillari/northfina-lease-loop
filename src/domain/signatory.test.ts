import { describe, expect, it } from 'vitest';
import {
  AWAITING_SIGNATURE,
  initialContractStatus,
  pendingSignatory,
  signatorySigning,
} from './signatory';

describe('pendingSignatory', () => {
  const company = { q_customer_type: 'company', q_can_sign: 'no' };
  it('is the named e-mail, normalised, when a company applicant cannot sign', () => {
    expect(pendingSignatory({ ...company, q_signatory_email: ' CEO@Norvi.example.com ' })).toBe(
      'ceo@norvi.example.com'
    );
  });
  it('is null when the applicant can sign, is not a company, or named nobody', () => {
    expect(pendingSignatory({ ...company, q_can_sign: 'yes', q_signatory_email: 'a@b.fi' })).toBe(
      null
    );
    expect(
      pendingSignatory({
        q_customer_type: 'consumer',
        q_can_sign: 'no',
        q_signatory_email: 'a@b.fi',
      })
    ).toBe(null);
    expect(pendingSignatory(company)).toBe(null);
    expect(pendingSignatory({ ...company, q_signatory_email: '   ' })).toBe(null);
  });
});

describe('initialContractStatus', () => {
  it('waits for a signatory, otherwise starts active', () => {
    expect(initialContractStatus('ceo@norvi.example.com')).toBe(AWAITING_SIGNATURE);
    expect(initialContractStatus(null)).toBe('active');
  });
});

describe('signatorySigning', () => {
  const waiting = { status: AWAITING_SIGNATURE, startDate: '2026-11-06' };
  it('starts billing on the signing day', () => {
    expect(signatorySigning(waiting, '2026-11-20')).toEqual({
      ok: true,
      startDate: '2026-11-20',
      signedOn: '2026-11-20',
    });
  });
  it('never starts before the date the contract was prepared for', () => {
    expect(signatorySigning(waiting, '2026-11-06')).toMatchObject({ startDate: '2026-11-06' });
    expect(signatorySigning(waiting, '2026-11-01')).toMatchObject({
      startDate: '2026-11-06',
      signedOn: '2026-11-01',
    });
  });
  it('only signs a contract that is waiting, and only with an ISO date', () => {
    for (const status of ['active', 'completed', 'returned', 'bought'])
      expect(signatorySigning({ ...waiting, status }, '2026-11-20')).toEqual({
        ok: false,
        reason: 'not_awaiting',
      });
    expect(signatorySigning(waiting, '20.11.2026')).toEqual({ ok: false, reason: 'invalid_date' });
  });
});
