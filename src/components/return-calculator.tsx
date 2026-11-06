'use client';

import { useState, type ReactNode } from 'react';
import type { ConditionAnswers } from '@/domain/condition-report';
import { returnPreviewAtMonth, type ReturnPreviewContext } from '@/domain/return-preview';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

/** One step of the formula: the rule in words, then the same rule with this item's numbers. */
function Step({ rule, children }: { rule: string; children: ReactNode }) {
  return (
    <div className="border-t border-hairline pt-4">
      <p className="text-caption text-ink-muted">{rule}</p>
      <p className="mt-1 font-semibold tabular-nums">{children}</p>
    </div>
  );
}

/** The real return calculation, written out with real numbers. The slider changes when it happens. */
export function ReturnCalculator({
  locale,
  data,
  answers,
  usage,
  currency,
}: {
  locale: Locale;
  data: ReturnPreviewContext;
  answers: ConditionAnswers;
  usage: number;
  currency: (cents: number) => string;
}) {
  const t = getT(locale);
  const term = data.finance.termMonths ?? data.finance.remainingMonths;
  const [month, setMonth] = useState(term - data.finance.remainingMonths);
  let r: ReturnType<typeof returnPreviewAtMonth> | null = null;
  try {
    r = returnPreviewAtMonth(data, answers, usage, month);
  } catch {
    /* An unreadable usage figure shows no invented numbers. */
  }
  if (!r || term < 1) return null;
  const percent = (value: number) => `${Math.round(value * 10) / 10} %`;
  const shortfall = r.owedTotalCents - r.worthTotalCents;
  return (
    <details className="rounded-lg border border-hairline p-5">
      <summary className="cursor-pointer py-2 font-semibold">{t('flow.calc.title')}</summary>
      <label className="mt-4 block text-caption font-semibold">
        {t('flow.calc.month', { month, term })}
        <input
          type="range"
          min={0}
          max={term}
          step={1}
          value={month}
          onChange={(event) => setMonth(Number(event.target.value))}
          className="mt-3 block w-full accent-primary"
        />
      </label>
      <div aria-live="polite" className="mt-4 space-y-4">
        <Step rule={t('flow.calc.totalRule')}>
          {currency(r.returnTotalCents)} = {currency(r.earlyReturnTotalCents)} +{' '}
          {currency(r.customerRepairTotalCents)} + {currency(r.unpaidCents)}
        </Step>
        <Step rule={t('flow.calc.endingRule')}>
          {currency(r.owedTotalCents)} − {currency(r.worthTotalCents)} ={' '}
          {currency(Math.max(0, shortfall))}
          {shortfall > r.earlyReturnTotalCents
            ? ` → ${t('flow.calc.capped', { amount: currency(r.earlyReturnTotalCents) })}`
            : ''}
        </Step>
        <Step rule={t('flow.calc.owedRule')}>
          {r.paymentsLeft} × {currency(r.monthlyTotalCents)} + {currency(r.endPriceTotalCents)} −{' '}
          {currency(r.interestSavedCents)} = {currency(r.owedTotalCents)}
        </Step>
        <Step rule={t('flow.calc.worthRule')}>
          {currency(r.originalTotalCents)} × {percent(r.factors.agePercent)} ×{' '}
          {percent(r.factors.conditionPercent)} × {percent(r.factors.usagePercent)} −{' '}
          {currency(r.standardWorkTotalCents)} = {currency(r.worthTotalCents)}
        </Step>
        <Step rule={t('flow.calc.repairsRule')}>
          {currency(r.repairsTotalCents)} × {percent(r.repairShareExactPercent)} ={' '}
          {currency(r.customerRepairTotalCents)}
        </Step>
        <Step rule={t('flow.calc.shareRule')}>
          50 % + 50 % × {r.remainingMonths} ÷ {term} = {percent(r.repairShareExactPercent)}
        </Step>
      </div>
      <p className="mt-4 text-fine text-ink-muted">{t('flow.calc.note')}</p>
    </details>
  );
}
