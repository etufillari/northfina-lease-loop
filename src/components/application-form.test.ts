import { describe, expect, it } from 'vitest';
import {
  canSignApplication,
  getSigningActor,
  shouldAcceptEvaluationResponse,
  type ApplicationDeal,
  type EvaluateState,
  type SignTarget,
} from './application-form';

const sampleDeal: ApplicationDeal = {
  category: 'laptop',
  financed_amount_cents: 100_000,
  term_months: 24,
  monthly_rent_incl_vat_cents: 5_000,
};

const sampleSignTarget: SignTarget = {
  assetId: 'asset-123',
  termMonths: 24,
  downPaymentCents: 10_000,
  signedOn: '2026-11-05',
};

const approvedState: EvaluateState = {
  status: 'ready',
  data: {
    questions: [],
    answers: { q_email: 'customer@example.com' },
    dropped: [],
    decision: {
      decision: 'yes',
      reasons: [],
    },
  },
};

describe('shouldAcceptEvaluationResponse', () => {
  it('accepts evaluation response when sequence matches and not aborted or signing', () => {
    expect(
      shouldAcceptEvaluationResponse({
        sequence: 3,
        latestSequence: 3,
        isAborted: false,
        isSigning: false,
      })
    ).toBe(true);
  });

  it('rejects stale out-of-order response with older sequence tag', () => {
    expect(
      shouldAcceptEvaluationResponse({
        sequence: 1,
        latestSequence: 2,
        isAborted: false,
        isSigning: false,
      })
    ).toBe(false);
  });

  it('rejects aborted request even if sequence matches', () => {
    expect(
      shouldAcceptEvaluationResponse({
        sequence: 4,
        latestSequence: 4,
        isAborted: true,
        isSigning: false,
      })
    ).toBe(false);
  });

  it('rejects response when signing is triggered / in progress', () => {
    expect(
      shouldAcceptEvaluationResponse({
        sequence: 5,
        latestSequence: 5,
        isAborted: false,
        isSigning: true,
      })
    ).toBe(false);
  });
});

describe('canSignApplication', () => {
  it('permits signing when application is approved, evaluated, and matching terms', () => {
    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: false,
        signTarget: sampleSignTarget,
        deal: sampleDeal,
        state: approvedState,
        latestSequence: 2,
        evaluatedSequence: 2,
      })
    ).toBe(true);
  });

  it('rejects signing when signing is already in progress (double-click prevention)', () => {
    expect(
      canSignApplication({
        isSigning: true,
        isEvaluating: false,
        signTarget: sampleSignTarget,
        deal: sampleDeal,
        state: approvedState,
        latestSequence: 2,
        evaluatedSequence: 2,
      })
    ).toBe(false);
  });

  it('rejects signing when evaluation is actively in progress or debouncing', () => {
    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: true,
        signTarget: sampleSignTarget,
        deal: sampleDeal,
        state: approvedState,
        latestSequence: 2,
        evaluatedSequence: 2,
      })
    ).toBe(false);
  });

  it('rejects signing when current form answers have not been evaluated yet (stale evaluate state)', () => {
    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: false,
        signTarget: sampleSignTarget,
        deal: sampleDeal,
        state: approvedState,
        latestSequence: 3, // typing incremented latestSequence
        evaluatedSequence: 2, // last evaluate was for sequence 2
      })
    ).toBe(false);
  });

  it('rejects signing when signTarget is missing', () => {
    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: false,
        signTarget: undefined,
        deal: sampleDeal,
        state: approvedState,
        latestSequence: 1,
        evaluatedSequence: 1,
      })
    ).toBe(false);
  });

  it('rejects signing when evaluate state is still loading or errored', () => {
    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: false,
        signTarget: sampleSignTarget,
        deal: sampleDeal,
        state: { status: 'loading' },
        latestSequence: 1,
        evaluatedSequence: 1,
      })
    ).toBe(false);

    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: false,
        signTarget: sampleSignTarget,
        deal: sampleDeal,
        state: { status: 'error' },
        latestSequence: 1,
        evaluatedSequence: 1,
      })
    ).toBe(false);
  });

  it('rejects signing when decision is not yes (incomplete, no, manual_review)', () => {
    const incompleteState: EvaluateState = {
      status: 'ready',
      data: {
        questions: [],
        answers: {},
        dropped: [],
        decision: {
          decision: 'incomplete',
          missing: ['q_residency'],
          reasons: [],
        },
      },
    };
    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: false,
        signTarget: sampleSignTarget,
        deal: sampleDeal,
        state: incompleteState,
        latestSequence: 1,
        evaluatedSequence: 1,
      })
    ).toBe(false);

    const rejectedState: EvaluateState = {
      status: 'ready',
      data: {
        questions: [],
        answers: {},
        dropped: [],
        decision: {
          decision: 'no',
          reasons: [{ rule: 'min_age', outcome: 'no', params: { age: 16, minimum: 18 } }],
        },
      },
    };
    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: false,
        signTarget: sampleSignTarget,
        deal: sampleDeal,
        state: rejectedState,
        latestSequence: 1,
        evaluatedSequence: 1,
      })
    ).toBe(false);
  });

  it('rejects signing when deal term does not match signTarget term (obsolete terms)', () => {
    expect(
      canSignApplication({
        isSigning: false,
        isEvaluating: false,
        signTarget: { ...sampleSignTarget, termMonths: 36 },
        deal: { ...sampleDeal, term_months: 24 },
        state: approvedState,
        latestSequence: 1,
        evaluatedSequence: 1,
      })
    ).toBe(false);
  });
});

describe('getSigningActor', () => {
  it('prefers trimmed email when present', () => {
    expect(getSigningActor({ q_email: '  test@example.com  ', q_business_id: '1234567-8' })).toBe(
      'test@example.com'
    );
  });

  it('falls back to business ID if email is not provided', () => {
    expect(getSigningActor({ q_business_id: ' 1234567-8 ' })).toBe('1234567-8');
  });

  it('falls back to customer if neither is provided', () => {
    expect(getSigningActor({})).toBe('customer');
  });

  it('truncates actor to 100 characters', () => {
    const longEmail = `${'a'.repeat(120)}@example.com`;
    expect(getSigningActor({ q_email: longEmail }).length).toBe(100);
  });
});
