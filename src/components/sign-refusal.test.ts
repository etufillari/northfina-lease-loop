// The Sign button's refusal notice (issue 39): every code the signing route returns is written
// from the message files with its params, and anything else falls back to the generic message.
import { describe, expect, it } from 'vitest';
import { messages } from '@/i18n/get-t';
import { signRefusalText } from './sign-refusal';

describe('signRefusalText', () => {
  it('writes start_too_far with the 12 months and the latest start as a date (D45)', () => {
    const text = signRefusalText('en', {
      code: 'start_too_far',
      params: { maxStartDate: '2027-11-05', startDate: '2027-11-06', maxMonths: 12 },
    });
    expect(text).toBe(
      'The lease must start within 12 months of signing, by 5 November 2027 at the latest.'
    );
  });

  it('writes a decision as its status text, not its code (card 7 before the admin decides)', () => {
    const text = signRefusalText('en', {
      code: 'application_not_approved',
      params: { decision: 'manual_review' },
    });
    expect(text).toContain('A person will check');
    expect(text).not.toContain('manual_review');
  });

  it('writes the last-unit race in the visitor language', () => {
    const reason = { code: 'asset_not_available', params: { status: 'leased' } };
    expect(signRefusalText('fi', reason)).toBe(messages.fi['contract.refusal.asset_not_available']);
  });

  it('has a message for every refusal code the route can return, in all four languages', () => {
    const codes = [
      'application_not_approved',
      'quote_expired',
      'asset_not_available',
      'start_before_signing',
      'start_too_far',
      'too_young_at_start',
      'already_signed',
      'application_not_found',
      'not_signed_in',
      'not_owner',
      'signatory_required',
    ];
    for (const locale of ['en', 'fi', 'sv', 'et'] as const) {
      for (const code of codes) {
        expect(signRefusalText(locale, { code, params: {} })).not.toBe(
          messages[locale]['contract.sign.error']
        );
      }
    }
  });

  it('falls back to the generic message for an unknown code, no code or no response', () => {
    const generic = messages.en['contract.sign.error'];
    expect(signRefusalText('en', { code: 'something_new', params: {} })).toBe(generic);
    expect(signRefusalText('en', {})).toBe(generic);
    expect(signRefusalText('en', null)).toBe(generic);
  });
});
