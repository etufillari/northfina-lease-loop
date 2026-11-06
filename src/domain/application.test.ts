import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { QuestionsFile } from '@/data/schemas';
import {
  applicationQuestions,
  assessApplication,
  type ApplicationAnswers,
  type ApplicationContext,
} from './application';

let bank: QuestionsFile;
beforeAll(async () => {
  bank = await loadQuestions();
});
const context: ApplicationContext = {
  categories: ['e_bike'],
  financedCents: 389000,
  monthlyTotalCents: 13466,
  termMonths: 36,
  startDate: '2026-11-05',
  minimumCents: 30000,
  maximumCents: 25000000,
};
export const consumer: ApplicationAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Test Applicant',
  q_birth_date: '1990-01-01',
  q_email: 'applicant@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 250000,
  q_usage_purpose: 'commuting',
};
const company: ApplicationAnswers = {
  q_customer_type: 'company',
  q_company_name: 'Test company',
  q_email: 'company@example.com',
  q_business_id: '1234567-1',
  q_can_sign: 'yes',
  q_vat_registered: 'yes',
  q_usage_purpose: 'delivery',
  q_pep: 'no',
  q_annual_revenue: 100000000,
  q_beneficial_owners: ['Test Owner'],
  q_farm_registry: 'farm-test',
};

describe('applicationQuestions', () => {
  it('shows only applicable questions and prunes stale or unknown answers', () => {
    const result = applicationQuestions(bank, context, {
      ...consumer,
      q_can_sign: 'no',
      q_signatory_email: 'old@example.com',
      q_pep_details: 'private',
      q_unknown: 'ignore',
    });
    expect(result.questions.map((question) => question.id)).toContain('q_usage_purpose');
    expect(result.answers.q_signatory_email).toBeUndefined();
    expect(result.answers.q_pep_details).toBeUndefined();
    expect(result.answers.q_unknown).toBeUndefined();
    expect(result.questions.some((question) => question.id === 'q_business_id')).toBe(false);
  });
  it('handles answer changes and all category/numeric conditions', () => {
    const large = { ...context, financedCents: 12500000, categories: ['farm_machine'] as const };
    const result = applicationQuestions(
      bank,
      { ...large, categories: [...large.categories] },
      {
        ...company,
        q_can_sign: 'no',
        q_signatory_email: 'sign@example.com',
        q_pep: 'yes',
        q_pep_details: 'Official role',
      }
    );
    expect(result.questions.map((q) => q.id)).toEqual(
      expect.arrayContaining([
        'q_annual_revenue',
        'q_beneficial_owners',
        'q_farm_registry',
        'q_signatory_email',
        'q_pep_details',
      ])
    );
    const changed = applicationQuestions(bank, context, {
      ...result.answers,
      q_customer_type: 'consumer',
    });
    expect(changed.answers.q_business_id).toBeUndefined();
    expect(changed.answers.q_pep_details).toBeUndefined();
    const signed = applicationQuestions(bank, context, {
      ...company,
      q_can_sign: 'yes',
      q_signatory_email: 'old@example.com',
    });
    expect(signed.answers.q_signatory_email).toBeUndefined();
  });
  it('supports lte and mixed-category carts', () => {
    const custom = {
      ...bank,
      questions: [
        {
          ...bank.questions[0]!,
          ask_when: [{ field: 'term_months', op: 'lte' as const, value: 24 }],
        },
      ],
    };
    expect(applicationQuestions(custom, context, {}).questions).toHaveLength(0);
    expect(applicationQuestions(custom, { ...context, termMonths: 24 }, {}).questions).toHaveLength(
      1
    );
    const mixed = applicationQuestions(
      bank,
      { ...context, categories: ['e_bike', 'farm_machine'] },
      consumer
    );
    expect(mixed.questions.map((q) => q.id)).toEqual(
      expect.arrayContaining(['q_usage_purpose', 'q_farm_registry'])
    );
  });
});

describe('assessApplication', () => {
  it('approves a complete eligible consumer', () => {
    expect(assessApplication(bank, context, consumer)).toMatchObject({
      status: 'approved',
      reasons: [],
    });
  });
  it('rejects a 17-year-old and approves on the eighteenth birthday', () => {
    const answers = { ...consumer, q_birth_date: '2008-11-06' };
    expect(assessApplication(bank, context, answers)).toMatchObject({
      status: 'rejected',
      reasons: ['under_age'],
    });
    expect(assessApplication(bank, { ...context, startDate: '2026-11-06' }, answers).status).toBe(
      'approved'
    );
  });
  it('rejects unsupported residency and invalid business IDs', () => {
    expect(assessApplication(bank, context, { ...consumer, q_country: 'other' }).reasons).toContain(
      'residency'
    );
    expect(
      assessApplication(bank, context, { ...company, q_business_id: '1234567-8' }).reasons
    ).toContain('business_id');
  });
  it('allows exactly 30% and rejects one cent above the combined affordability limit', () => {
    const answers = { ...consumer, q_monthly_income: 100000 };
    expect(assessApplication(bank, { ...context, monthlyTotalCents: 30000 }, answers).status).toBe(
      'approved'
    );
    expect(
      assessApplication(bank, { ...context, monthlyTotalCents: 30001 }, answers)
    ).toMatchObject({ status: 'rejected', reasons: ['affordability'] });
  });
  it('approves an applicant who cannot sign, noting that the named signatory must sign', () => {
    const answers = { ...company, q_can_sign: 'no', q_signatory_email: 'sign@example.com' };
    expect(assessApplication(bank, context, answers)).toMatchObject({
      status: 'approved',
      reasons: ['signatory_pending'],
    });
    // Without the signatory's e-mail the application is incomplete, never approved.
    const { q_signatory_email: _email, ...missing } = answers;
    expect(assessApplication(bank, context, missing)).toMatchObject({
      status: 'incomplete',
      missing: ['q_signatory_email'],
    });
    // A review reason still wins: the note is only shown on approvals.
    expect(assessApplication(bank, { ...context, financedCents: 5000000 }, answers).status).toBe(
      'manual_review'
    );
  });
  it('routes PEPs and the big-ticket farm scenario to people', () => {
    expect(
      assessApplication(
        bank,
        { ...context, financedCents: 1000000 },
        { ...company, q_pep: 'yes', q_pep_details: 'Public role' }
      ).reasons
    ).toContain('pep');
    expect(
      assessApplication(
        bank,
        { ...context, categories: ['farm_machine'], financedCents: 12500000 },
        company
      )
    ).toMatchObject({ status: 'manual_review', reasons: ['large_amount'] });
  });
  describe('income threshold (the bank asks consumers for income from 200 000 cents)', () => {
    const { q_monthly_income: _income, ...withoutIncome } = consumer;
    it('approves below the threshold without an income answer, with an explanatory note', () => {
      expect(
        assessApplication(bank, { ...context, financedCents: 199999 }, withoutIncome)
      ).toMatchObject({ status: 'approved', reasons: ['income_not_required'] });
    });
    it('ignores a stale income answer once the question no longer applies', () => {
      const result = assessApplication(
        bank,
        { ...context, financedCents: 199999, monthlyTotalCents: 900000 },
        { ...consumer, q_monthly_income: 1 }
      );
      expect(result).toMatchObject({ status: 'approved', reasons: ['income_not_required'] });
      expect(result.answers.q_monthly_income).toBeUndefined();
    });
    it('requires income exactly at the threshold and applies the 30 % rule', () => {
      const atThreshold = { ...context, financedCents: 200000, monthlyTotalCents: 7500 };
      expect(assessApplication(bank, atThreshold, withoutIncome)).toMatchObject({
        status: 'incomplete',
        missing: ['q_monthly_income'],
      });
      expect(
        assessApplication(bank, atThreshold, { ...consumer, q_monthly_income: 25000 })
      ).toMatchObject({ status: 'approved', reasons: [] });
      expect(
        assessApplication(bank, atThreshold, { ...consumer, q_monthly_income: 24999 })
      ).toMatchObject({ status: 'rejected', reasons: ['affordability'] });
    });
    it('uses the combined cart amount, so splitting items cannot avoid the income question', () => {
      expect(
        assessApplication(bank, { ...context, financedCents: 230000 }, withoutIncome)
      ).toMatchObject({ status: 'incomplete', missing: ['q_monthly_income'] });
    });
    it('still rejects or reviews below the threshold for other reasons, without the note', () => {
      const small = { ...context, financedCents: 110300 };
      expect(
        assessApplication(bank, small, { ...withoutIncome, q_birth_date: '2009-03-10' })
      ).toMatchObject({ status: 'rejected', reasons: ['under_age'] });
      expect(
        assessApplication(bank, small, { ...withoutIncome, q_country: 'other' })
      ).toMatchObject({ status: 'rejected', reasons: ['residency'] });
    });
    it('does not add the note for companies, which have no income question', () => {
      expect(
        assessApplication(bank, { ...context, financedCents: 199999 }, company).reasons
      ).not.toContain('income_not_required');
    });
  });
  it('reports missing, malformed and impossible answers without approving', () => {
    for (const change of [
      { q_monthly_income: 'bad' },
      { q_country: 'bad' },
      { q_email: 'bad' },
      { q_birth_date: '2026-02-30' },
      { q_birth_date: '2027-01-01' },
    ] as ApplicationAnswers[]) {
      expect(assessApplication(bank, context, { ...consumer, ...change }).status).toBe(
        'incomplete'
      );
    }
    expect(assessApplication(bank, context, {}).status).toBe('incomplete');
    expect(
      assessApplication(
        bank,
        { ...context, financedCents: 12500000 },
        { ...company, q_beneficial_owners: [] }
      ).missing
    ).toContain('q_beneficial_owners');
  });
  it('gives rejection precedence and enforces financing bands', () => {
    expect(
      assessApplication(bank, { ...context, financedCents: 25000001 }, company).reasons
    ).toEqual(['financed_limits']);
    expect(assessApplication(bank, { ...context, financedCents: 29999 }, consumer).status).toBe(
      'rejected'
    );
    expect(
      assessApplication(
        bank,
        { ...context, financedCents: 1000000 },
        { ...consumer, q_birth_date: '2009-01-01', q_pep: 'yes', q_pep_details: 'Role' }
      ).status
    ).toBe('rejected');
  });
  it('rejects invalid caller context as a programming error', () => {
    expect(() => assessApplication(bank, { ...context, financedCents: 1.5 }, consumer)).toThrow(
      RangeError
    );
    expect(() => assessApplication(bank, { ...context, startDate: 'bad' }, consumer)).toThrow(
      RangeError
    );
  });
});
