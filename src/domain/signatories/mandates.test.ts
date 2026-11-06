import { describe, expect, it } from 'vitest';
import {
  REQUEST_VALID_DAYS,
  activeSignatories,
  canSign,
  normaliseEmail,
  requestExpiresOn,
  requestOutcome,
  revoke,
  signingCheck,
  type Mandate,
} from './mandates';

const norviBoard: Mandate = {
  id: 'sig-1',
  email: 'board@norvi.example.com',
  validFrom: '2026-01-01',
  validTo: null,
};
const cfo: Mandate = {
  id: 'sig-2',
  email: 'cfo@norvi.example.com',
  validFrom: '2026-06-01',
  validTo: '2026-11-06',
};

describe('normaliseEmail', () => {
  it('trims and lowers the case', () => {
    expect(normaliseEmail('  Board@Norvi.Example.COM ')).toBe('board@norvi.example.com');
  });
});

describe('activeSignatories (D46)', () => {
  it('valid_from is the first day the right holds, inclusive', () => {
    expect(activeSignatories([cfo], '2026-05-31')).toEqual([]);
    expect(activeSignatories([cfo], '2026-06-01')).toEqual([cfo]);
  });

  it('valid_to is the first day it no longer holds: exclusive', () => {
    expect(activeSignatories([cfo], '2026-11-05')).toEqual([cfo]);
    expect(activeSignatories([cfo], '2026-11-06')).toEqual([]);
  });

  it('an entry still waiting for its link (no valid_from) is not active', () => {
    expect(activeSignatories([{ ...cfo, validFrom: null, validTo: null }], '2026-11-05')).toEqual(
      []
    );
  });

  it('no end date: active from valid_from on', () => {
    expect(activeSignatories([norviBoard, cfo], '2030-01-01')).toEqual([norviBoard]);
  });
});

describe('canSign', () => {
  it('matches the e-mail with case and spaces ignored', () => {
    expect(canSign([norviBoard], ' BOARD@norvi.example.com', '2026-11-05')).toBe(true);
  });

  it('another e-mail, a blank one or an ended right cannot sign', () => {
    expect(canSign([norviBoard], 'fleet@norvi.example.com', '2026-11-05')).toBe(false);
    expect(canSign([norviBoard], '  ', '2026-11-05')).toBe(false);
    expect(canSign([cfo], 'cfo@norvi.example.com', '2026-11-06')).toBe(false);
  });
});

describe('revoke', () => {
  it('ends the right on the day: it no longer holds from then on', () => {
    const result = revoke([norviBoard, cfo], 'sig-1', '2026-11-05');
    expect(result).toEqual({ ok: true, mandate: { ...norviBoard, validTo: '2026-11-05' } });
    if (result.ok) expect(canSign([result.mandate], norviBoard.email, '2026-11-05')).toBe(false);
  });

  it('the trap: the last active signatory cannot be revoked', () => {
    expect(revoke([norviBoard], 'sig-1', '2026-11-05')).toEqual({
      ok: false,
      code: 'last_signatory',
    });
    // cfo's right has ended by 2026-11-06, so the board is the last one that day
    expect(revoke([norviBoard, cfo], 'sig-1', '2026-11-06')).toEqual({
      ok: false,
      code: 'last_signatory',
    });
  });

  it('an unknown id, or a right already ended, is refused', () => {
    expect(revoke([norviBoard], 'nope', '2026-11-05')).toEqual({ ok: false, code: 'not_found' });
    expect(revoke([norviBoard, cfo], 'sig-2', '2026-11-06')).toEqual({
      ok: false,
      code: 'already_ended',
    });
  });

  it('an entry not yet in force ends before it starts (an empty range), never active', () => {
    const waiting: Mandate = { ...cfo, id: 'sig-3', validFrom: null, validTo: null };
    const result = revoke([norviBoard, waiting], 'sig-3', '2026-11-05');
    expect(result).toEqual({
      ok: true,
      mandate: { ...waiting, validFrom: '2026-11-05', validTo: '2026-11-05' },
    });
  });
});

const request = { expiresOn: '2026-11-19', signedOn: null, declinedOn: null };

describe('requestOutcome', () => {
  it('a fresh request is pending up to the day before expires_on', () => {
    expect(requestOutcome(request, '2026-11-05')).toEqual({ code: 'pending', params: {} });
    expect(requestOutcome(request, '2026-11-18')).toEqual({ code: 'pending', params: {} });
  });

  it('the trap: an expired request is expired on its expires_on day', () => {
    expect(requestOutcome(request, '2026-11-19')).toEqual({
      code: 'expired',
      params: { expiresOn: '2026-11-19' },
    });
  });

  it('the trap: a used request is already_used, even after it would have expired', () => {
    expect(requestOutcome({ ...request, signedOn: '2026-11-06' }, '2026-12-01')).toEqual({
      code: 'already_used',
      params: { outcome: 'signed', on: '2026-11-06' },
    });
    expect(requestOutcome({ ...request, declinedOn: '2026-11-06' }, '2026-11-07')).toEqual({
      code: 'already_used',
      params: { outcome: 'declined', on: '2026-11-06' },
    });
  });

  it('the link is valid for 14 days from the day it is sent', () => {
    expect(REQUEST_VALID_DAYS).toBe(14);
    expect(requestExpiresOn('2026-11-05')).toBe('2026-11-19');
    expect(requestExpiresOn('2026-12-25')).toBe('2027-01-08');
  });
});

describe('signingCheck (D46)', () => {
  const waiting: Mandate = {
    id: 'sig-9',
    email: 'signatory@norvi.example.com',
    validFrom: null,
    validTo: null,
  };

  it('card 6: the named signatory opens the link, which registers them on the day', () => {
    expect(signingCheck(request, waiting, '2026-11-06')).toEqual({ ok: true, activates: true });
  });

  it('a signatory already on the list and active signs without a new registration', () => {
    expect(signingCheck(request, norviBoard, '2026-11-06')).toEqual({ ok: true, activates: false });
  });

  it('a revoked signatory cannot use a link sent before the revocation', () => {
    const revoked = { ...norviBoard, validTo: '2026-11-06' };
    expect(signingCheck(request, revoked, '2026-11-06')).toEqual({
      ok: false,
      code: 'signatory_not_active',
    });
  });

  it('an expired or used link signs nothing', () => {
    expect(signingCheck(request, waiting, '2026-11-19')).toMatchObject({
      ok: false,
      code: 'expired',
    });
    expect(
      signingCheck({ ...request, signedOn: '2026-11-06' }, waiting, '2026-11-06')
    ).toMatchObject({ ok: false, code: 'already_used' });
  });
});
