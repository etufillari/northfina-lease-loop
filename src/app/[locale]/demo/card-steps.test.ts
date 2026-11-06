// The demo page writes the runner's codes from the message files: money as euros, days as dates,
// the app's own words for decisions, and every placeholder filled, in all four languages.
import { describe, expect, it } from 'vitest';
import { getT } from '@/i18n/get-t';
import { locales } from '@/i18n/locales';
import { DEMO_CARDS } from '@/server/demo-cards';
import { cardInputs } from './card-list';
import { codedMessage, type CodedLine } from './card-steps';

const names = new Map([['cust-aino', 'Aino Virtanen']]);

/** Every code the runner (src/server/demo-cards.ts) can answer, with params of its shape. */
const STEPS: CodedLine[] = [
  {
    code: 'quote_created',
    params: {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      monthlyNetCents: 10_730,
      priceListVersion: 2,
      date: '2026-11-05',
    },
  },
  {
    code: 'application_decided',
    params: { decision: 'rejected', date: '2026-11-05' },
  },
  {
    code: 'application_reason',
    params: { reason: 'too_young', birthDate: '2009-03-10', eighteenOn: '2027-03-10' },
  },
  { code: 'application_reason', params: { reason: 'pep' } },
  { code: 'application_reused', params: { decision: 'approved', date: '2026-11-05' } },
  {
    code: 'contract_signed',
    params: {
      number: 'LL-1',
      monthlyNetCents: 10_730,
      startDate: '2026-11-05',
      endDate: '2029-11-04',
      date: '2026-11-05',
    },
  },
  {
    code: 'price_locked_from_quote',
    params: {
      quoteDate: '2026-11-05',
      priceListVersion: 1,
      currentPriceListVersion: 2,
      currentMonthlyNetCents: 8_857,
    },
  },
  { code: 'contract_reused', params: {} },
  { code: 'rents_paid', params: { count: 7, grossCents: 94_532 } },
  {
    code: 'exit_previewed',
    params: { monthsPaid: 7, buyTotalCents: 330_675, returnTotalCents: 75_945, date: '2027-06-05' },
  },
  {
    code: 'asset_assessed',
    params: {
      assetId: 'ebike-007',
      condition: 'fair',
      refurbishmentCents: 39_500,
      secondLifeFinancedCents: 115_976,
      date: '2026-11-06',
    },
  },
  {
    code: 'relisted_for_winner',
    params: { demandId: 'wait-02', condition: 'fair', termMonths: 12, monthlyNetCents: 6_497 },
  },
  { code: 'relisted_without_match', params: { condition: 'fair' } },
  { code: 'leased_from_catalogue', params: { demandId: 'wait-05', customer: 'cust-olavi' } },
];
const REFUSALS: CodedLine[] = [
  { code: 'card_already_run', params: { cardId: 1 } },
  {
    code: 'card_step_refused',
    params: { cardId: 5, step: 'quote', reason: 'asset_not_available' },
  },
];

describe('codedMessage', () => {
  it('writes money as euros, days as dates and the decision in words', () => {
    const t = getT('en');
    expect(codedMessage('demo.step', STEPS[0]!, t, 'en')).toContain('€107.30');
    expect(codedMessage('demo.step', STEPS[0]!, t, 'en')).toContain('5 November 2026');
    expect(codedMessage('demo.step', STEPS[1]!, t, 'en')).toContain(t('decision.status.rejected'));
    expect(
      codedMessage(
        'demo.step',
        { code: 'rents_paid', params: { count: 7, grossCents: 94_532 } },
        t,
        'en'
      )
    ).toContain('€945.32');
  });

  it('writes a decision reason with its own sentence and params, never the code', () => {
    const t = getT('en');
    const line = codedMessage('demo.step', STEPS[2]!, t, 'en');
    expect(line).toBe(t('decision.reason.too_young', { eighteenOn: '10 March 2027' }));
    expect(line).not.toContain('too_young');
    expect(
      codedMessage('demo.step', { code: 'application_reason', params: { reason: 'nope' } }, t, 'en')
    ).toBe(t('decision.reason.unknown', { code: 'nope' }));
  });

  it("writes a refused step with the step's name and the service's own refusal sentence", () => {
    const t = getT('en');
    expect(codedMessage('demo.run', REFUSALS[1]!, t, 'en')).toBe(
      `Card 5 stopped at the quote: ${t('pricing.refusal.asset_not_available')}`
    );
    const payment = {
      code: 'card_step_refused',
      params: { cardId: 8, step: 'payment', reason: 'already_paid' },
    };
    expect(codedMessage('demo.run', payment, t, 'en')).toBe(
      'Card 8 stopped at a payment: already_paid'
    );
  });

  it.each(locales)('fills every placeholder of every step and refusal in %s', (locale) => {
    const t = getT(locale);
    for (const step of STEPS)
      expect(codedMessage('demo.step', step, t, locale)).not.toMatch(/[{}]/);
    for (const line of REFUSALS)
      expect(codedMessage('demo.run', line, t, locale)).not.toMatch(/[{}]/);
  });
});

describe('cardInputs', () => {
  it('says who, what and which days for card 8', () => {
    const line = cardInputs(DEMO_CARDS[7]!, names, getT('en'), 'en');
    expect(line).toBe(
      'Aino Virtanen · ebike-003 · 36 months · €0.00 down · quoted on 5 November 2026 · signed on 5 November 2026 · run card 1 first · 7 rents paid · exit preview: Buy it, reported Good, 1800 km · clock to 5 June 2027'
    );
  });

  it.each(locales)('leaves no placeholder in any card in %s', (locale) => {
    for (const card of DEMO_CARDS) {
      expect(cardInputs(card, names, getT(locale), locale)).not.toMatch(/[{}]/);
    }
  });
});
