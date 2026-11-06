import { expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import { prepareApplicationAnswers } from './application-answers';
import { decideApplication } from './application';
import { loadAssets } from '@/data/load';
const customers = await loadCustomers(),
  questions = (await loadQuestions()).questions,
  assets = await loadAssets();
const aino = customers.find((c) => c.id === 'cust-aino'),
  norvi = customers.find((c) => c.id === 'cust-norvi'),
  asset = assets.find((a) => a.id === 'ebike-003');
if (!aino || !norvi || !asset) throw new Error('fixture');
const facts = {
  customerType: 'consumer',
  category: 'e_bike',
  financedCents: 389000,
  termMonths: 36,
};
it('evaluates declared income/age/PEP instead of ignoring the submitted answers', () => {
  const prepared = prepareApplicationAnswers(
    aino,
    questions,
    { ...facts, financedCents: 1000000 },
    {
      q_customer_type: 'consumer',
      q_monthly_income: '100',
      q_pep: 'yes',
    }
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) return;
  expect(prepared.customer.is_pep).toBe(true);
  expect(
    decideApplication({
      customer: prepared.customer,
      asset,
      monthlyNetCents: 10730,
      asOf: '2026-11-05',
    }).status
  ).toBe('MANUAL_REVIEW');
  const underage = prepareApplicationAnswers(aino, questions, facts, {
    q_birth_date: '2009-01-01',
  });
  if (!underage.ok) throw new Error('answers');
  expect(
    decideApplication({
      customer: underage.customer,
      asset,
      monthlyNetCents: 10730,
      asOf: '2026-11-05',
    }).status
  ).toBe('REJECTED');
});
it('cannot upgrade a company signer and drops answers that no longer apply', () => {
  const prepared = prepareApplicationAnswers(
    norvi,
    questions,
    { ...facts, customerType: 'company' },
    { q_can_sign: 'yes', q_monthly_income: '1000' }
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) return;
  expect(prepared.customer.type === 'company' && prepared.customer.applicant_can_sign).toBe(false);
  expect(prepared.answers.q_monthly_income).toBeUndefined();
  expect(prepareApplicationAnswers(aino, questions, facts, { invented: 'x' }).ok).toBe(false);
  expect(prepareApplicationAnswers(aino, questions, facts, { q_customer_type: 'company' }).ok).toBe(
    false
  );
  expect(
    prepareApplicationAnswers(aino, questions, facts, { q_monthly_income: 'nonsense' }).ok
  ).toBe(false);
});
it('uses gross30% affordability, allowed residency and sole-trader minimum age', () => {
  expect(
    decideApplication({
      customer: aino,
      asset,
      monthlyNetCents: 80000,
      asOf: '2026-11-05',
      vatRateBps: 2550,
    }).status
  ).toBe('REJECTED');
  expect(
    decideApplication({
      customer: { ...aino, country: 'US' },
      asset,
      monthlyNetCents: 10000,
      asOf: '2026-11-05',
    }).status
  ).toBe('REJECTED');
  const sole = customers.find((c) => c.type === 'sole_trader');
  if (!sole || sole.type !== 'sole_trader') throw new Error('fixture');
  expect(
    decideApplication({
      customer: { ...sole, birth_date: '2009-01-01' },
      asset,
      monthlyNetCents: 10000,
      asOf: '2026-11-05',
    }).status
  ).toBe('REJECTED');
});
