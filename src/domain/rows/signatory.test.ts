import { describe, expect, it } from 'vitest';
import {
  companySignatoryRowSchema,
  signatoryEmailSchema,
  signatureRequestAnswerSchema,
  signatureRequestRowSchema,
} from './signatory';

const entry = {
  customer_id: 'cust-kettukoodi',
  name: 'Kettu Koodi Oy',
  email: 'it@kettukoodi.example.com',
  granted_by: 'register_check_simulated',
  granted_on: '2026-11-05',
  valid_from: '2026-11-05',
  valid_to: null,
};

describe('signatoryEmailSchema', () => {
  it('stores the e-mail trimmed and lower case, refuses what is not one', () => {
    expect(signatoryEmailSchema.parse('  IT@Kettukoodi.example.com ')).toBe(
      'it@kettukoodi.example.com'
    );
    expect(signatoryEmailSchema.safeParse('not an email').success).toBe(false);
  });
});

describe('companySignatoryRowSchema (D46)', () => {
  it('takes a seeded entry and one still waiting for its link', () => {
    expect(companySignatoryRowSchema.safeParse(entry).success).toBe(true);
    expect(companySignatoryRowSchema.safeParse({ ...entry, valid_from: null }).success).toBe(true);
  });

  it('refuses an end before the start, or an end with no start', () => {
    expect(companySignatoryRowSchema.safeParse({ ...entry, valid_to: '2026-11-04' }).success).toBe(
      false
    );
    expect(
      companySignatoryRowSchema.safeParse({ ...entry, valid_from: null, valid_to: '2026-11-05' })
        .success
    ).toBe(false);
    // an empty range (a revoked entry that never came into force) is allowed
    expect(companySignatoryRowSchema.safeParse({ ...entry, valid_to: '2026-11-05' }).success).toBe(
      true
    );
  });
});

describe('signatureRequestRowSchema', () => {
  const request = {
    application_id: 'app-1',
    signatory_id: 'sig-1',
    token: 'a'.repeat(32),
    sent_on: '2026-11-05',
    expires_on: '2026-11-19',
  };

  it('takes a link that expires after it is sent', () => {
    expect(signatureRequestRowSchema.safeParse(request).success).toBe(true);
    expect(
      signatureRequestRowSchema.safeParse({ ...request, expires_on: '2026-11-05' }).success
    ).toBe(false);
  });

  it('refuses a short or guessable token', () => {
    expect(signatureRequestRowSchema.safeParse({ ...request, token: 'abc' }).success).toBe(false);
    expect(
      signatureRequestRowSchema.safeParse({ ...request, token: `${'a'.repeat(32)}/` }).success
    ).toBe(false);
  });
});

describe('signatureRequestAnswerSchema', () => {
  it('is signed or declined, never both or neither', () => {
    const opened = { opened_on: '2026-11-06' };
    expect(
      signatureRequestAnswerSchema.safeParse({
        ...opened,
        signed_on: '2026-11-06',
        declined_on: null,
      }).success
    ).toBe(true);
    expect(
      signatureRequestAnswerSchema.safeParse({ ...opened, signed_on: null, declined_on: null })
        .success
    ).toBe(false);
    expect(
      signatureRequestAnswerSchema.safeParse({
        ...opened,
        signed_on: '2026-11-06',
        declined_on: '2026-11-06',
      }).success
    ).toBe(false);
  });
});
