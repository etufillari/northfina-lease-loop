import { describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import { AFFORDABILITY_PERCENT, MANUAL_REVIEW_WHEN } from './pricing-rules';

describe('rules as config (D-038)', () => {
  it('caps a consumer’s rent incl. VAT at 30 % of monthly net income (the rules, D-023)', () => {
    expect(AFFORDABILITY_PERCENT).toBe(30);
  });

  it('sends a politically exposed person to manual review, never to auto-approval', () => {
    expect(MANUAL_REVIEW_WHEN).toEqual([
      { questionId: 'q_pep', answer: 'yes', reason: 'pep_manual_review' },
    ]);
  });

  it('names only questions and answers that exist in the question bank', async () => {
    const { questions } = await loadQuestions();
    for (const rule of MANUAL_REVIEW_WHEN) {
      const question = questions.find((q) => q.id === rule.questionId);
      expect(question?.options, rule.questionId).toContain(rule.answer);
    }
  });
});
