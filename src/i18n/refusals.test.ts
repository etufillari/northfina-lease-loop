import { describe, expect, it } from 'vitest';
import { getT, messages } from './get-t';
import { locales } from './locales';
import { refusalCodes, refusalMessageKey, refusalText } from './refusals';

// Every code a route can answer, read from the routes' `fail(` calls and their `statusFor` maps
// (the compiler keeps `refusalCodes` equal to the server's refusal types).
const fromRoutes = [
  // the envelope (api-response.ts) and the not-found checks in the routes
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'INTERNAL_ERROR',
  'QUOTE_NOT_FOUND',
  'CONTRACT_NOT_FOUND',
  'INVALID_AS_OF_DATE',
  // POST /api/quotes
  'ASSET_NOT_FOUND',
  'ASSET_NOT_AVAILABLE',
  'UNKNOWN_ASSET',
  'BELOW_MINIMUM',
  'ABOVE_MAXIMUM',
  'UNKNOWN_TERM',
  'DOWN_PAYMENT_NEGATIVE',
  'DOWN_PAYMENT_OFF_STEP',
  'DOWN_PAYMENT_TOO_LARGE',
  'NO_PRICE_LIST_ON_DATE',
  // POST /api/contracts
  'QUOTE_ALREADY_USED',
  'QUOTE_EXPIRED',
  'SIGNED_BEFORE_QUOTE',
  'PRICE_CHOICE_REQUIRED',
  'PRICE_CHANGED',
  'UNKNOWN_CUSTOMER',
  'ANSWERS_DO_NOT_MATCH_CUSTOMER',
  'STARTS_BEFORE_SIGNING',
  'NO_VAT_RATE',
  'APPLICATION_INCOMPLETE',
  'APPLICATION_INVALID',
  'APPLICATION_DECLINED',
  'APPLICATION_NEEDS_REVIEW',
  // POST /api/contracts/:id/sign (D-053)
  'NOT_AWAITING_SIGNATURE',
  'SIGNED_BEFORE_SENT',
  // POST /api/contracts/:id/end and /end-early
  'CONTRACT_NOT_ACTIVE',
  'ALREADY_ENDED',
  'ASSET_NOT_LEASED',
  'TOO_EARLY',
  'USAGE_WENT_DOWN',
  'CONDITION_IMPROVED',
  'NEXT_LESSEE_IS_CURRENT',
  'UNKNOWN_WAITING_LIST_ENTRY',
  'WAITING_LIST_NOT_A_MATCH',
  'UNKNOWN_BAND',
  'TABLE_CHANGED',
  'MONTH_CHANGED',
  'NOT_STARTED',
  'TERM_OVER',
  // POST /api/assets/:id/relist
  'ASSET_NOT_RETURNED',
  'TARGET_NOT_ALLOWED',
  // POST /api/contracts/:id/hand-over (#65)
  'NOT_PASSED_ON',
  'ALREADY_HANDED_OVER',
  'NO_PRICE',
];

describe('refusal messages (D-038)', () => {
  it('knows exactly the codes the routes can answer', () => {
    expect(refusalCodes.map((code) => code.toUpperCase()).sort()).toEqual([...fromRoutes].sort());
  });

  it.each(locales)('has a message for every code in %s, with no placeholders left', (locale) => {
    for (const code of fromRoutes) {
      const key = refusalMessageKey(code, 'lease.error');
      expect(key, code).not.toBe('lease.error');
      const text = messages[locale][key];
      expect(text?.trim(), `${locale}: ${code}`).toBeTruthy();
      expect(text, `${locale}: ${code}`).not.toMatch(/\{\w+\}/);
    }
  });

  it('turns a code into its own kind message, in the locale', () => {
    expect(refusalText(getT('en'), 'QUOTE_EXPIRED', 'lease.error')).toBe(
      messages.en['refusal.quote_expired']
    );
    expect(refusalText(getT('fi'), 'APPLICATION_DECLINED', 'lease.error')).toBe(
      messages.fi['refusal.application_declined']
    );
    expect(refusalText(getT('en'), 'ANSWERS_DO_NOT_MATCH_CUSTOMER', 'lease.error')).toBe(
      messages.en['lease.errorRecord']
    );
  });

  it('falls back to the form’s own message for an unknown or missing code', () => {
    const t = getT('sv');
    expect(refusalText(t, 'SOMETHING_NEW', 'end.error')).toBe(messages.sv['end.error']);
    expect(refusalText(t, undefined, 'end.error')).toBe(messages.sv['end.error']);
    // Only own keys count, never what an object inherits.
    expect(refusalText(t, 'CONSTRUCTOR', 'end.error')).toBe(messages.sv['end.error']);
  });
});
