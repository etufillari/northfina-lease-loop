// Answers that cannot be true, that conflict with each other or with the customer record, and
// the order the reasons win in: every case runs the whole flow on a real deal through the
// harness (`applyFor` takes the steps `createApplication` takes). Nothing here knows a card;
// the personas and the assets are the data pack's.
import { describe, expect, it } from 'vitest';
import { answersFromCustomer } from '../question-flow/answers';
import { applyFor, customerById, type Application } from './fixtures';

const DAY = '2026-11-05';
const aino = customerById('cust-aino');
const mikko = customerById('cust-mikko');
const olavi = customerById('cust-olavi');
const kettu = customerById('cust-kettukoodi');
const norvi = customerById('cust-norvi');
const haapala = customerById('cust-haapala');
const typo = customerById('cust-broken-id');

const bike = (isoDate = DAY) => ({
  assetId: 'ebike-003',
  termMonths: 36,
  isoDate,
});
/** farm-008 at 1 290 000 financed: PEP is asked; a company is not asked revenue or owners. */
const farm = { assetId: 'farm-008', termMonths: 48, isoDate: DAY };

/** `{ decision, codes }` of a completed application, or the step it stopped at. */
function outcome(app: Application) {
  if (!app.ok) {
    if (app.step === 'quote') return `quote:${app.quote.ok ? '' : app.quote.reason.code}`;
    if (app.step === 'invalid') return `invalid:${app.questionId}:${app.problem.code}`;
    return `incomplete:${app.questionId}`;
  }
  return `${app.result.decision}:${app.result.reasons.map((r) => r.code).join('+')}`;
}

/** The questions a differing answer names, in the order the reasons list them. */
const differing = (app: Application) =>
  app.ok
    ? app.result.reasons
        .filter((r) => r.code === 'answer_differs_from_record')
        .map((r) => r.params.question)
    : [];

describe('birth dates (D37, D9)', () => {
  const born = (q_birth_date: string, deal = bike(), customer = aino) =>
    applyFor(customer, deal, { answers: { q_birth_date } });

  it('today is an answer: the applicant is 0 and too young until 2044-11-05', () => {
    const app = born(DAY);
    expect(app.ok && app.result).toMatchObject({
      decision: 'rejected',
      reasons: [{ code: 'too_young', params: { birthDate: DAY, eighteenOn: '2044-11-05' } }],
    });
  });

  it('tomorrow is refused as out of range, with the range in the params', () => {
    expect(born('2026-11-06')).toEqual({
      ok: false,
      step: 'invalid',
      questionId: 'q_birth_date',
      problem: { code: 'birth_date_out_of_range', params: { earliest: '1906-11-05', latest: DAY } },
    });
  });

  it('exactly 120 years ago is an answer (held for the record check), one day more is refused', () => {
    const edge = born('1906-11-05');
    expect(outcome(edge)).toBe('manual_review:answer_differs_from_record');
    expect(outcome(born('1906-11-04'))).toBe('invalid:q_birth_date:birth_date_out_of_range');
  });

  it('a 29 February birthday turns 18 on 1 March of a common year: 28 Feb too young, 1 Mar not', () => {
    const feb28 = born('2008-02-29', bike('2026-02-28'));
    expect(feb28.ok && feb28.result).toMatchObject({
      decision: 'rejected',
      reasons: [{ code: 'too_young', params: { eighteenOn: '2026-03-01' } }],
    });
    const mar1 = born('2008-02-29', bike('2026-03-01'));
    expect(mar1.ok && mar1.result.reasons.map((r) => r.code)).not.toContain('too_young');
  });

  it('29 February of a common year is not a day: 2010-02-29 is refused, 2008-02-29 is taken', () => {
    expect(outcome(born('2010-02-29'))).toBe('invalid:q_birth_date:invalid');
    expect(born('2008-02-29').ok).toBe(true);
  });

  it('the age is judged on the start date, not the quote day: Mikko quoted on 9 Mar 2027, starting the 10th', () => {
    const deal = { assetId: 'laptop-008', termMonths: 36, isoDate: '2027-03-09' };
    expect(outcome(applyFor(mikko, deal))).toBe('rejected:too_young');
    expect(outcome(applyFor(mikko, deal, { startDate: '2027-03-10' }))).toBe(
      'approved:all_checks_passed'
    );
  });

  it('a birth date one day off the record is an answer, but a person checks it (D38)', () => {
    const app = born('1997-04-13');
    expect(outcome(app)).toBe('manual_review:answer_differs_from_record');
    expect(differing(app)).toEqual(['q_birth_date']);
  });

  it.each([
    ['', 'an empty string'],
    ['2009-03-10T00:00:00Z', 'a date with a time'],
    ['10.03.2009', 'a Finnish-style date'],
    ['2009-3-10', 'a month without its zero'],
    ['2009-03-32', 'a day that does not exist'],
    ['2009-13-01', 'a month that does not exist'],
    ['yesterday', 'a word'],
  ])('%s (%s) is not a date answer', (value) => {
    expect(outcome(born(value, bike(), mikko))).toBe('invalid:q_birth_date:invalid');
  });

  it('spaces around a date are not part of the answer: Mikko is still Mikko', () => {
    expect(outcome(born(' 2009-03-10 ', bike(), mikko))).toBe('rejected:too_young+unaffordable');
  });
});

describe('the customer type and the record (D38)', () => {
  const asCompany = {
    q_customer_type: 'company',
    q_business_id: '0737546-2',
    q_company_name: 'Own Oy',
    q_can_sign: 'yes',
    q_vat_registered: 'no',
  };
  const asConsumer = {
    q_customer_type: 'consumer',
    q_full_name: 'Someone',
    q_birth_date: '1990-01-01',
    q_country: 'FI',
    q_employment: 'employed',
    q_monthly_income: '500000',
  };

  it('a consumer on record answering "company" skips the age question and is held for a person', () => {
    const app = applyFor(aino, bike(), { answers: asCompany });
    expect(app.ok && app.askedIds).not.toContain('q_birth_date');
    expect(outcome(app)).toBe('manual_review:answer_differs_from_record');
    expect(differing(app)).toEqual(['q_customer_type']);
  });

  it('a company on record answering "consumer" is held too; the record has no birth date to compare', () => {
    const app = applyFor(kettu, bike(), { answers: asConsumer });
    expect(outcome(app)).toBe('manual_review:answer_differs_from_record');
    expect(differing(app)).toEqual(['q_customer_type']);
  });

  it('a 17-year-old answering "sole trader" is still asked his age and rejected', () => {
    const answers = {
      q_customer_type: 'sole_trader',
      q_business_id: '0737546-2',
      q_vat_registered: 'no',
    };
    expect(outcome(applyFor(mikko, bike(), { answers }))).toBe('rejected:too_young');
  });

  it('the broken business id on record is rejected; the corrected id differs from the record, so a person checks', () => {
    expect(outcome(applyFor(typo, bike()))).toBe('rejected:invalid_business_id');
    const corrected = applyFor(typo, bike(), { answers: { q_business_id: '1234567-1' } });
    expect(outcome(corrected)).toBe('manual_review:answer_differs_from_record');
    expect(differing(corrected)).toEqual(['q_business_id']);
  });

  it.each([
    ['3187650-8', 'a wrong check digit'],
    ['3187650 -7', 'a space before the hyphen'],
    ['31876507', 'no hyphen'],
    ['FI3187650-7', 'a VAT-number prefix'],
    ['fi3187650-7', 'a lowercase prefix'],
    ['3187650-7-', 'a trailing character'],
  ])('%s (%s) is rejected with invalid_business_id, not held for the record', (id) => {
    const app = applyFor(kettu, bike(), { answers: { q_business_id: id } });
    expect(app.ok && app.result).toEqual({
      decision: 'rejected',
      reasons: [{ code: 'invalid_business_id', params: { businessId: id } }],
    });
  });

  it('spaces around a business id are not an answer of their own', () => {
    expect(outcome(applyFor(kettu, bike(), { answers: { q_business_id: '  3187650-7  ' } }))).toBe(
      'approved:all_checks_passed'
    );
  });

  it('"VAT registered" without a business id is an incomplete flow, not a decision', () => {
    const { q_business_id: _dropped, ...answers } = answersFromCustomer(kettu);
    const app = applyFor(kettu, bike(), { answers: { ...answers, q_business_id: '' } });
    expect(outcome(app)).toBe('invalid:q_business_id:invalid');
  });

  it('a country outside FI, SE and EE is rejected; a country other than the record is held', () => {
    expect(outcome(applyFor(aino, bike(), { answers: { q_country: 'other' } }))).toBe(
      'rejected:residency_not_allowed'
    );
    const moved = applyFor(aino, bike(), { answers: { q_country: 'SE' } });
    expect(outcome(moved)).toBe('manual_review:answer_differs_from_record');
    expect(differing(moved)).toEqual(['q_country']);
    expect(outcome(applyFor(aino, bike(), { answers: { q_country: 'DE' } }))).toBe(
      'invalid:q_country:invalid'
    );
  });

  it('the record says PEP and the answer says no: manual review, and the "no" is named (card 7, D58, D82)', () => {
    const farm = { assetId: 'farm-002', termMonths: 48, downPaymentCents: 2_000_000, isoDate: DAY };
    const app = applyFor(haapala, farm, { answers: { q_pep: 'no' } });
    // The decision uses the answer (D82), so no `pep` reason; the difference from the record is
    // the recheck of known data (D38, D58), and a person looks at it.
    expect(outcome(app)).toBe('manual_review:answer_differs_from_record');
    expect(app.ok && app.result.reasons[0]).toEqual({
      code: 'answer_differs_from_record',
      params: { question: 'q_pep' },
    });
  });

  it('the record says no PEP and the answer says yes: a manual review, with details required', () => {
    expect(outcome(applyFor(kettu, farm, { answers: { q_pep: 'yes' } }))).toBe(
      'incomplete:q_pep_details'
    );
    expect(
      outcome(applyFor(kettu, farm, { answers: { q_pep: 'yes', q_pep_details: 'MP since 2019' } }))
    ).toBe('manual_review:pep');
  });

  it('the trap: Norvi’s coordinator, who may not sign on record, answers "yes, I can sign"', () => {
    const app = applyFor(
      norvi,
      { assetId: 'ebike-004', termMonths: 36, isoDate: DAY },
      {
        answers: { q_can_sign: 'yes' },
      }
    );
    expect(outcome(app)).toBe('manual_review:answer_differs_from_record');
    expect(differing(app)).toEqual(['q_can_sign']);
  });

  it('Kettu Koodi, who may sign on record, answering "no" and naming a signatory is held too', () => {
    const app = applyFor(kettu, bike(), {
      answers: { q_can_sign: 'no', q_signatory_email: 'ceo@kettukoodi.example.com' },
    });
    expect(outcome(app)).toBe('manual_review:answer_differs_from_record+signatory_needed');
  });
});

describe('conflicting and extra answers', () => {
  const fleet = { assetId: 'ebike-004', termMonths: 36, isoDate: DAY };

  it('an answer to a question this deal does not ask is dropped, not refused', () => {
    const app = applyFor(aino, bike(), {
      answers: { q_business_id: 'garbage', q_pep_details: 'x' },
    });
    expect(outcome(app)).toBe('approved:all_checks_passed');
    expect(app.ok && app.answers).not.toHaveProperty('q_business_id');
    expect(app.ok && app.answers).not.toHaveProperty('q_pep_details');
  });

  it('"can sign: no" without the signatory is incomplete; "yes" with a signatory drops the signatory', () => {
    const { q_signatory_email: _dropped, ...noSignatory } = answersFromCustomer(norvi);
    expect(
      outcome(applyFor(norvi, fleet, { answers: { ...noSignatory, q_signatory_email: '' } }))
    ).toBe('invalid:q_signatory_email:invalid');
    const yes = applyFor(kettu, fleet, {
      answers: { q_can_sign: 'yes', q_signatory_email: 'ceo@kettukoodi.example.com' },
    });
    expect(yes.ok && yes.answers).not.toHaveProperty('q_signatory_email');
    expect(outcome(yes)).toBe('approved:all_checks_passed');
  });

  it.each([
    ['fleet@norvi.example.com', 'the same address'],
    ['FLEET@NORVI.EXAMPLE.COM', 'upper case'],
    ['  fleet@norvi.example.com ', 'spaces around it'],
  ])('the signatory cannot be the applicant: %s (%s)', (email) => {
    expect(outcome(applyFor(norvi, fleet, { answers: { q_signatory_email: email } }))).toBe(
      'invalid:q_signatory_email:signatory_is_applicant'
    );
  });

  it('the trap: a different e-mail answer does not let the applicant name their record e-mail as signatory', () => {
    const app = applyFor(norvi, fleet, {
      answers: {
        q_email: 'coordinator.private@example.net',
        q_signatory_email: 'Fleet@norvi.example.com',
      },
    });
    expect(outcome(app)).toBe('invalid:q_signatory_email:signatory_is_applicant');
  });

  it.each(['not-an-email', 'ceo@norvi', 'ceo norvi@example.com', '@norvi.example.com'])(
    'an e-mail without the shape is not an answer: %s',
    (email) => {
      expect(outcome(applyFor(norvi, fleet, { answers: { q_signatory_email: email } }))).toBe(
        'invalid:q_signatory_email:invalid'
      );
    }
  );

  it('PEP details without PEP are dropped; PEP without details is incomplete', () => {
    const app = applyFor(norvi, farm, { answers: { q_pep: 'no', q_pep_details: 'minister' } });
    expect(app.ok && app.answers).not.toHaveProperty('q_pep_details');
    expect(outcome(applyFor(norvi, farm, { answers: { q_pep: 'yes' } }))).toBe(
      'incomplete:q_pep_details'
    );
  });

  it('a choice answered as a list is not an answer, and never crashes the targeting', () => {
    const app = applyFor(norvi, fleet, { answers: { q_can_sign: ['no'] } });
    expect(outcome(app)).toBe('invalid:q_can_sign:invalid');
  });

  it('the signatory may be another customer of the pack: awaiting_signatory (the real flow is a one-time link)', () => {
    const app = applyFor(norvi, fleet, { answers: { q_signatory_email: aino.email } });
    expect(app.ok && app.result).toEqual({
      decision: 'awaiting_signatory',
      reasons: [{ code: 'signatory_needed', params: { signatoryEmail: aino.email } }],
    });
  });

  it('q_email other than the record e-mail holds the case (D38 as amended in #49, which superseded D53)', () => {
    expect(outcome(applyFor(aino, bike(), { answers: { q_email: 'aino.new@example.net' } }))).toBe(
      'manual_review:answer_differs_from_record'
    );
  });
});

describe('precedence: a failed rule, a differing answer and a PEP at once', () => {
  // farm-008 at 1 290 000 financed: PEP is asked, and a consumer's farm machine is held
  const pep = { q_pep: 'yes', q_pep_details: 'MP since 2019' };

  it('a rejection wins over the record and the PEP, and lists the failures only', () => {
    const app = applyFor(mikko, farm, {
      answers: { ...pep, q_birth_date: '2009-03-11' },
    });
    expect(outcome(app)).toBe('rejected:too_young+unaffordable');
  });

  it('a differing answer and a PEP together: manual review with pep first, then the question, then the category hold', () => {
    const app = applyFor(olavi, farm, { answers: { ...pep, q_birth_date: '1956-06-19' } });
    expect(app.ok && app.result).toEqual({
      decision: 'manual_review',
      reasons: [
        { code: 'pep', params: {} },
        { code: 'answer_differs_from_record', params: { question: 'q_birth_date' } },
        { code: 'category_needs_review', params: { category: 'farm_machine' } },
      ],
    });
  });

  it('the outcome is the same from every order of the answers', () => {
    const base = {
      ...answersFromCustomer(olavi),
      ...pep,
      q_birth_date: '1956-06-19',
      q_country: 'EE',
    };
    const entries = Object.entries(base);
    const orders = [
      entries,
      [...entries].reverse(),
      [...entries].sort(([a], [b]) => (a < b ? 1 : -1)),
    ];
    const results = orders.map((order) =>
      applyFor(olavi, farm, { answers: Object.fromEntries(order) })
    );
    for (const app of results) expect(app).toEqual(results[0]);
    expect(differing(results[0]!)).toEqual(['q_birth_date', 'q_country']);
  });
});
