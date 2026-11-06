// The Pay button's refusal notice (review of PR #70): each code the pay route returns is written
// from the message files, an authorization refusal wins through `details.code`, and anything
// else, including an inherited property name or a missing body, falls back to the generic text.
import { describe, expect, it } from 'vitest';
import { messages } from '@/i18n/get-t';
import { payRefusalText } from './pay-refusal';

const fail = (code: unknown, details?: unknown) => ({ success: false, error: { code, details } });

describe('payRefusalText', () => {
  it('writes the three pay route codes from the message files', () => {
    expect(payRefusalText('en', fail('INVOICE_ALREADY_PAID'))).toBe(
      messages.en['invoice.pay.refusal.already_paid']
    );
    expect(payRefusalText('en', fail('INVOICE_CANCELLED'))).toBe(
      messages.en['invoice.pay.refusal.cancelled']
    );
    expect(payRefusalText('fi', fail('PAID_BEFORE_SIGNING'))).toBe(
      messages.fi['invoice.pay.refusal.before_signing']
    );
  });

  it('writes an authorization refusal from details.code (D74)', () => {
    const body = fail('FORBIDDEN', { code: 'not_owner', params: {} });
    expect(payRefusalText('sv', body)).toBe(messages.sv['authz.refusal.not_owner']);
  });

  it('falls back to the unknown message for an inherited name like constructor or toString', () => {
    const unknown = messages.en['invoice.pay.refusal.unknown'];
    expect(payRefusalText('en', fail('constructor'))).toBe(unknown);
    expect(payRefusalText('en', fail('toString'))).toBe(unknown);
    expect(payRefusalText('en', fail('INTERNAL', { code: 'constructor' }))).toBe(unknown);
  });

  it('falls back to the unknown message when there is no body or no code', () => {
    const unknown = messages.et['invoice.pay.refusal.unknown'];
    expect(payRefusalText('et', null)).toBe(unknown);
    expect(payRefusalText('et', undefined)).toBe(unknown);
    expect(payRefusalText('et', { success: false })).toBe(unknown);
    expect(payRefusalText('et', fail(42))).toBe(unknown);
  });
});
