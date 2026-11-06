import { expect, it } from 'vitest';
import { mayJoinWaitingList } from './waiting-list';

const input = {
  onDate: '2026-11-06',
  neededBy: '2026-11-06',
  monthlyBudgetCents: 9000,
  termMonths: 12,
  supportedTerms: [12, 24, 36, 48],
};
it('accepts today and a future deadline without changing the inputs', () => {
  const before = structuredClone(input);
  expect(mayJoinWaitingList(input)).toEqual({ ok: true });
  expect(mayJoinWaitingList({ ...input, neededBy: '2026-12-01' })).toEqual({ ok: true });
  expect(input).toEqual(before);
});
it.each([
  [{ onDate: 'bad' }, 'date'],
  [{ neededBy: '2026-02-30' }, 'date'],
  [{ neededBy: '2026-11-05' }, 'deadline'],
  [{ monthlyBudgetCents: 0 }, 'budget'],
  [{ monthlyBudgetCents: -1 }, 'budget'],
  [{ monthlyBudgetCents: 0.5 }, 'budget'],
  [{ monthlyBudgetCents: Infinity }, 'budget'],
  [{ monthlyBudgetCents: 2_147_483_648 }, 'budget'],
  [{ termMonths: 18 }, 'term'],
  [{ termMonths: 12.5 }, 'term'],
  [{ supportedTerms: [] }, 'term'],
] as const)('rejects %o with %s', (change, reason) => {
  expect(mayJoinWaitingList({ ...input, ...change })).toEqual({ ok: false, reason });
});
it('accepts one cent and the maximum supported stored amount', () => {
  for (const monthlyBudgetCents of [1, 2_147_483_647])
    expect(mayJoinWaitingList({ ...input, monthlyBudgetCents })).toEqual({ ok: true });
});
