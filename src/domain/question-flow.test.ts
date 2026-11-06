import { expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import { applicableQuestions, pruneQuestionAnswers } from './question-flow';
const questions = (await loadQuestions()).questions;
it('card7 targets company big-ticket questions and removes answers made irrelevant by edits', () => {
  const facts = {
    customerType: 'company',
    category: 'farm_machine',
    financedCents: 12500000,
    termMonths: 48,
  };
  const ids = applicableQuestions(questions, facts, {
    q_customer_type: 'company',
    q_can_sign: 'no',
  }).map((q) => q.id);
  expect(ids).toContain('q_beneficial_owners');
  expect(ids).toContain('q_can_sign');
  const pruned = pruneQuestionAnswers(
    questions,
    { ...facts, customerType: 'consumer', financedCents: 100000 },
    {
      q_customer_type: 'consumer',
      q_can_sign: 'no',
      q_beneficial_owners: 'old',
      q_full_name: 'Aino',
    }
  );
  expect(pruned.q_can_sign).toBeUndefined();
  expect(pruned.q_beneficial_owners).toBeUndefined();
  expect(pruned.q_full_name).toBe('Aino');
});
