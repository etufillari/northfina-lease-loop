import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadCustomers, loadQuestions } from '@/data/load';
import type { CoefficientTable, Customer, QuestionsFile } from '@/data/schemas';
import {
  calculateAge,
  evaluateEligibility,
  getVisibleQuestions,
  isQuestionVisible,
  isValidFinnishBusinessId,
  pruneIrrelevantAnswers,
  validateQuestionAnswer,
  type QuestionFlowContext,
} from './question-flow';

let questionsFile: QuestionsFile;
let coefficientTable: CoefficientTable;
let customers: Customer[];
let minLimitCents: number;
let maxLimitCents: number;

beforeAll(async () => {
  [questionsFile, coefficientTable, customers] = await Promise.all([
    loadQuestions(),
    loadCoefficientTable(),
    loadCustomers(),
  ]);

  minLimitCents = Math.min(...coefficientTable.bands.map((b) => b.min_financed_cents));
  maxLimitCents = Math.max(...coefficientTable.bands.map((b) => b.max_financed_cents));
});

function getContext(overrides: Partial<QuestionFlowContext> = {}): QuestionFlowContext {
  return {
    customerType: 'consumer',
    category: 'e_bike',
    financedAmountCents: 389000,
    termMonths: 36,
    monthlyRentInclVatCents: 13466,
    todayIso: '2026-11-05',
    minFinancedCents: minLimitCents,
    maxFinancedCents: maxLimitCents,
    ...overrides,
  };
}

describe('isValidFinnishBusinessId', () => {
  it('validates all legitimate company business IDs from the data pack', () => {
    const pekka = customers.find((c) => c.id === 'cust-pekka')!;
    const kettu = customers.find((c) => c.id === 'cust-kettukoodi')!;
    const haapala = customers.find((c) => c.id === 'cust-haapala')!;
    const norvi = customers.find((c) => c.id === 'cust-norvi')!;

    if ('business_id' in pekka) expect(isValidFinnishBusinessId(pekka.business_id)).toBe(true);
    if ('business_id' in kettu) expect(isValidFinnishBusinessId(kettu.business_id)).toBe(true);
    if ('business_id' in haapala) expect(isValidFinnishBusinessId(haapala.business_id)).toBe(true);
    if ('business_id' in norvi) expect(isValidFinnishBusinessId(norvi.business_id)).toBe(true);
  });

  it('catches the deliberate check-digit trap from data/customers.json (Typo Trading)', () => {
    const typo = customers.find((c) => c.id === 'cust-broken-id')!;
    if ('business_id' in typo) {
      expect(isValidFinnishBusinessId(typo.business_id)).toBe(false);
    }
  });

  it('rejects malformed numbers and non-digits', () => {
    expect(isValidFinnishBusinessId('12345678')).toBe(false); // missing hyphen
    expect(isValidFinnishBusinessId('123456-7')).toBe(false); // only 6 digits
    expect(isValidFinnishBusinessId('abcdefg-1')).toBe(false);
    expect(isValidFinnishBusinessId('')).toBe(false);
  });
});

describe('calculateAge', () => {
  const today = '2026-11-05';

  it('computes correct age for test personas', () => {
    const aino = customers.find((c) => c.id === 'cust-aino')!;
    const mikko = customers.find((c) => c.id === 'cust-mikko')!;

    if ('birth_date' in aino) expect(calculateAge(aino.birth_date, today)).toBe(29);
    if ('birth_date' in mikko) expect(calculateAge(mikko.birth_date, today)).toBe(17);
  });

  it('evaluates exact 18th birthday boundaries', () => {
    expect(calculateAge('2008-11-05', today)).toBe(18); // 18 today
    expect(calculateAge('2008-11-06', today)).toBe(17); // turns 18 tomorrow
    expect(calculateAge('2008-11-04', today)).toBe(18); // turned 18 yesterday
  });
});

describe('isQuestionVisible & getVisibleQuestions with real question pack', () => {
  it('targets customer-type specific questions from data/questions.json', () => {
    const qBiz = questionsFile.questions.find((q) => q.id === 'q_business_id')!;
    const qEmp = questionsFile.questions.find((q) => q.id === 'q_employment')!;

    // For consumer: employment is visible, business_id is not
    expect(isQuestionVisible(qEmp, { q_customer_type: 'consumer' }, getContext())).toBe(true);
    expect(isQuestionVisible(qBiz, { q_customer_type: 'consumer' }, getContext())).toBe(false);

    // For company: business_id is visible, employment is not
    expect(
      isQuestionVisible(
        qEmp,
        { q_customer_type: 'company' },
        getContext({ customerType: 'company' })
      )
    ).toBe(false);
    expect(
      isQuestionVisible(
        qBiz,
        { q_customer_type: 'company' },
        getContext({ customerType: 'company' })
      )
    ).toBe(true);

    const visibleForConsumer = getVisibleQuestions(
      questionsFile.questions,
      { q_customer_type: 'consumer' },
      getContext()
    );
    expect(visibleForConsumer.some((q) => q.id === 'q_employment')).toBe(true);
    expect(visibleForConsumer.some((q) => q.id === 'q_business_id')).toBe(false);
  });

  it('targets category specific questions', () => {
    const qPurpose = questionsFile.questions.find((q) => q.id === 'q_usage_purpose')!;
    const qFarm = questionsFile.questions.find((q) => q.id === 'q_farm_registry')!;

    // E-bike
    expect(isQuestionVisible(qPurpose, {}, getContext({ category: 'e_bike' }))).toBe(true);
    expect(isQuestionVisible(qFarm, {}, getContext({ category: 'e_bike' }))).toBe(false);

    // Farm machine
    expect(isQuestionVisible(qPurpose, {}, getContext({ category: 'farm_machine' }))).toBe(false);
    expect(isQuestionVisible(qFarm, {}, getContext({ category: 'farm_machine' }))).toBe(true);

    // Laptop gets neither
    expect(isQuestionVisible(qPurpose, {}, getContext({ category: 'laptop' }))).toBe(false);
    expect(isQuestionVisible(qFarm, {}, getContext({ category: 'laptop' }))).toBe(false);
  });

  it('targets dependent signatory email only when applicant cannot sign', () => {
    const qSignEmail = questionsFile.questions.find((q) => q.id === 'q_signatory_email')!;

    expect(
      isQuestionVisible(
        qSignEmail,
        { q_customer_type: 'company', q_can_sign: 'yes' },
        getContext({ customerType: 'company' })
      )
    ).toBe(false);

    expect(
      isQuestionVisible(
        qSignEmail,
        { q_customer_type: 'company', q_can_sign: 'no' },
        getContext({ customerType: 'company' })
      )
    ).toBe(true);
  });
});

describe('pruneIrrelevantAnswers', () => {
  it('cleans up company answers when switching to consumer', () => {
    const companyAnswers: Record<string, string> = {
      q_customer_type: 'company',
      q_business_id: '3187650-7',
      q_company_name: 'Kettu Koodi Oy',
      q_can_sign: 'no',
      q_signatory_email: 'board@kettukoodi.example.com',
    };

    const switched = { ...companyAnswers, q_customer_type: 'consumer' };
    const pruned = pruneIrrelevantAnswers(questionsFile.questions, switched, getContext());

    expect(pruned).toEqual({ q_customer_type: 'consumer' });
    expect(pruned.q_business_id).toBeUndefined();
    expect(pruned.q_company_name).toBeUndefined();
    expect(pruned.q_can_sign).toBeUndefined();
    expect(pruned.q_signatory_email).toBeUndefined();
  });
});

describe('validateQuestionAnswer', () => {
  it('validates question formats against real question specifications', () => {
    const qBiz = questionsFile.questions.find((q) => q.id === 'q_business_id')!;
    expect(validateQuestionAnswer(qBiz, '3187650-7', getContext()).valid).toBe(true);
    expect(validateQuestionAnswer(qBiz, '1234567-8', getContext()).valid).toBe(false);

    const qBirth = questionsFile.questions.find((q) => q.id === 'q_birth_date')!;
    expect(validateQuestionAnswer(qBirth, '1997-04-12', getContext()).valid).toBe(true);
    expect(validateQuestionAnswer(qBirth, '2009-03-10', getContext()).valid).toBe(false);
  });
});

describe('evaluateEligibility with real scenarios', () => {
  it('approves Happy Path (Scenario 1: Aino)', () => {
    const ainoAnswers: Record<string, string> = {
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino.virtanen@example.com',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: '3200',
      q_usage_purpose: 'commuting',
    };

    const result = evaluateEligibility(questionsFile.questions, ainoAnswers, getContext());
    expect(result.status).toBe('approved');
    expect(result.reasons).toHaveLength(0);
  });

  it('rejects applicant under 18 (Scenario 5: Mikko)', () => {
    const mikkoAnswers: Record<string, string> = {
      q_customer_type: 'consumer',
      q_full_name: 'Mikko Laine',
      q_birth_date: '2009-03-10', // 17 years old
      q_email: 'mikko.laine@example.com',
      q_country: 'FI',
      q_employment: 'student',
    };

    const result = evaluateEligibility(questionsFile.questions, mikkoAnswers, getContext());
    expect(result.status).toBe('rejected');
    expect(result.reasons.some((r) => r.ruleId === 'min_age')).toBe(true);
  });

  it('routes to manual review when applicant cannot sign (Scenario 6: Norvi Logistics)', () => {
    const norviAnswers: Record<string, string> = {
      q_customer_type: 'company',
      q_email: 'fleet@norvi.example.com',
      q_business_id: '3299871-7',
      q_company_name: 'Norvi Logistics Oy',
      q_can_sign: 'no',
      q_signatory_email: 'board@norvi.example.com',
      q_vat_registered: 'yes',
      q_usage_purpose: 'delivery',
    };

    const result = evaluateEligibility(
      questionsFile.questions,
      norviAnswers,
      getContext({ customerType: 'company', category: 'e_bike' })
    );

    expect(result.status).toBe('manual_review');
    expect(result.reasons.some((r) => r.ruleId === 'signatory_authorization')).toBe(true);
  });

  it('routes to manual review when a beneficial owner is a PEP (Scenario 7: Haapalan Tila)', () => {
    const haapalaAnswers: Record<string, string> = {
      q_customer_type: 'company',
      q_email: 'office@haapala.example.com',
      q_business_id: '2876543-5',
      q_company_name: 'Haapalan Tila Oy',
      q_can_sign: 'yes',
      q_vat_registered: 'yes',
      q_farm_registry: 'FI-FARM-9941',
      q_annual_revenue: '950000',
      q_beneficial_owners: 'Matti Haapala, Liisa Haapala',
      q_pep: 'yes',
      q_pep_details: 'Board member of regional council',
    };

    const result = evaluateEligibility(
      questionsFile.questions,
      haapalaAnswers,
      getContext({
        customerType: 'company',
        category: 'farm_machine',
        financedAmountCents: 12500000,
      })
    );

    expect(result.status).toBe('manual_review');
    expect(result.reasons.some((r) => r.ruleId === 'pep_manual_review')).toBe(true);
  });

  it('rejects company with invalid business ID check digit (Typo Trading)', () => {
    const typoAnswers: Record<string, string> = {
      q_customer_type: 'company',
      q_email: 'admin@typo.example.com',
      q_business_id: '1234567-8', // invalid check digit
      q_company_name: 'Typo Trading Oy',
      q_can_sign: 'yes',
      q_vat_registered: 'yes',
    };

    const result = evaluateEligibility(
      questionsFile.questions,
      typoAnswers,
      getContext({ customerType: 'company' })
    );

    expect(result.status).toBe('rejected');
    expect(result.reasons.some((r) => r.ruleId === 'business_id')).toBe(true);
  });

  it('rejects when rent exceeds 30% of income (Sanna cargo bike affordability)', () => {
    const sannaAnswers: Record<string, string> = {
      q_customer_type: 'consumer',
      q_full_name: 'Sanna Mäkelä',
      q_birth_date: '2004-11-02',
      q_email: 'sanna.makela@example.com',
      q_country: 'FI',
      q_employment: 'student',
      q_monthly_income: '900', // €900.00/mo net -> 30% is €270.00 max
      q_usage_purpose: 'commuting',
    };

    // Rent is €280.00 incl. VAT (28000 cents), which exceeds €270.00
    const result = evaluateEligibility(
      questionsFile.questions,
      sannaAnswers,
      getContext({ monthlyRentInclVatCents: 28000 })
    );

    expect(result.status).toBe('rejected');
    expect(result.reasons.some((r) => r.ruleId === 'affordability')).toBe(true);
  });

  it('does NOT reject if stale answers from previous flows linger in state for invisible fields', () => {
    // User filled company data with invalid Y-tunnus and applicant_can_sign = no,
    // but changed customer_type to consumer.
    const lingeringAnswers: Record<string, string> = {
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino.virtanen@example.com',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: '3200',
      q_usage_purpose: 'commuting',
      // Stale company keys lingering in form state:
      q_business_id: '1234567-8',
      q_can_sign: 'no',
    };

    const result = evaluateEligibility(questionsFile.questions, lingeringAnswers, getContext());
    // Since business_id and can_sign are invisible for consumer, they must not trigger reject/review!
    expect(result.status).toBe('approved');
    expect(result.reasons).toHaveLength(0);
  });

  it('enforces table boundary limits derived from coefficient table', () => {
    // 1 cent below the minimum band limit
    const belowMin = evaluateEligibility(
      questionsFile.questions,
      {},
      getContext({ financedAmountCents: minLimitCents - 1 })
    );
    expect(belowMin.status).toBe('rejected');
    expect(belowMin.reasons.some((r) => r.ruleId === 'financed_limits')).toBe(true);

    // 1 cent above the maximum band limit
    const aboveMax = evaluateEligibility(
      questionsFile.questions,
      {},
      getContext({ financedAmountCents: maxLimitCents + 1 })
    );
    expect(aboveMax.status).toBe('rejected');
    expect(aboveMax.reasons.some((r) => r.ruleId === 'financed_limits')).toBe(true);
  });
});
