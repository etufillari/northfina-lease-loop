import { describe, expect, it } from 'vitest';
import {
  signatoryEmail,
  signatureStatus,
  signatureValidUntil,
  waitsOnlyForSignatory,
  type SignatureInput,
} from './signature';

const norvi: SignatureInput = {
  decision: 'manual_review',
  reasons: ['signatory_authorization'],
  quoteDate: '2026-11-06',
  signedDate: null,
  declinedDate: null,
  today: '2026-11-06',
};

describe('signatoryEmail', () => {
  it('reads the trimmed email, or null', () => {
    expect(signatoryEmail({ q_signatory_email: ' cfo@norvi.example ' })).toBe('cfo@norvi.example');
    expect(signatoryEmail({ q_signatory_email: '  ' })).toBeNull();
    expect(signatoryEmail({})).toBeNull();
  });
});

describe('waitsOnlyForSignatory', () => {
  it('is true when the signature is the only thing missing', () => {
    expect(waitsOnlyForSignatory('manual_review', ['signatory_authorization'])).toBe(true);
  });

  it('is false when a person must also review it, or it was refused or approved', () => {
    expect(
      waitsOnlyForSignatory('manual_review', ['signatory_authorization', 'pep_manual_review'])
    ).toBe(false);
    expect(waitsOnlyForSignatory('rejected', ['signatory_authorization'])).toBe(false);
    expect(waitsOnlyForSignatory('approved', [])).toBe(false);
    expect(waitsOnlyForSignatory('manual_review', [])).toBe(false);
  });
});

describe('signatureStatus', () => {
  it('card 6: Norvi waits for its signatory', () => {
    expect(signatureStatus(norvi)).toBe('waiting');
  });

  it('is no signature request without the signatory rule, or before the application existed', () => {
    expect(signatureStatus({ ...norvi, reasons: ['pep_manual_review'] })).toBeNull();
    expect(signatureStatus({ ...norvi, today: '2026-11-05' })).toBeNull();
  });

  it('is signed or declined from that day on, and waiting again when travelling back', () => {
    expect(signatureStatus({ ...norvi, signedDate: '2026-11-10', today: '2026-11-10' })).toBe(
      'signed'
    );
    expect(signatureStatus({ ...norvi, signedDate: '2026-11-10', today: '2026-11-09' })).toBe(
      'waiting'
    );
    expect(signatureStatus({ ...norvi, declinedDate: '2026-11-08', today: '2026-11-08' })).toBe(
      'declined'
    );
    expect(signatureStatus({ ...norvi, declinedDate: '2026-11-08', today: '2026-11-07' })).toBe(
      'waiting'
    );
  });

  it('keeps the quoted price for 14 days, then expires', () => {
    expect(signatureValidUntil('2026-11-06')).toBe('2026-11-20');
    expect(signatureStatus({ ...norvi, today: '2026-11-20' })).toBe('waiting');
    expect(signatureStatus({ ...norvi, today: '2026-11-21' })).toBe('expired');
  });

  it('needs a person first when there is another reason for review', () => {
    expect(
      signatureStatus({ ...norvi, reasons: ['signatory_authorization', 'pep_manual_review'] })
    ).toBe('needs_review');
  });
});
