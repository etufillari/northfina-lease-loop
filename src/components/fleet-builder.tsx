'use client';

// Fleet leasing, step 1: pick the items (one category), the term, and see the fleet's price
// add up live. Step 2 is the usual application form, asked once for the whole fleet. The
// choice is kept in session storage, so switching language keeps it.
import { useMemo } from 'react';
import type { AssetCategory, AssetCondition, CoefficientTable, Question } from '@/data/schemas';
import { MAX_FLEET_ITEMS, checkFleet, fleetQuestionContext, fleetTotals } from '@/domain/fleet';
import { formatEuro } from '@/domain/money';
import { quoteLease, type LeaseQuote } from '@/domain/pricing';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { ApplicationForm } from './application-form';
import { useSessionState } from './use-session-state';

export type FleetItem = {
  id: string;
  category: AssetCategory;
  name: string;
  condition: AssetCondition;
  listPriceCents: number;
};

type FleetBuilderProps = {
  items: FleetItem[];
  table: CoefficientTable;
  vatPercent: number;
  terms: number[];
  questions: Question[];
  initialAnswers: Record<string, string>;
  viewerKey: string;
  today: string;
  locale: Locale;
};

type Choice = { category: AssetCategory; termMonths: number; selected: string[] };

export function FleetBuilder(props: FleetBuilderProps) {
  const { items, table, vatPercent, terms, today, locale } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);
  const initial = useMemo<Choice>(
    () => ({
      category: categories[0] ?? 'laptop',
      termMonths: terms.includes(36) ? 36 : (terms[0] ?? 36),
      selected: [],
    }),
    [categories, terms]
  );
  const [choice, setChoice] = useSessionState(`fleet:${props.viewerKey}:choice`, initial);

  // Every item of the category priced for the chosen term (no down payment in a fleet).
  const quotes = new Map<string, LeaseQuote | null>();
  for (const item of items) {
    if (item.category !== choice.category) continue;
    const result = quoteLease(
      {
        listPriceCents: item.listPriceCents,
        downPaymentCents: 0,
        termMonths: choice.termMonths,
        vatPercent,
      },
      table
    );
    quotes.set(item.id, result.ok ? result.quote : null);
  }
  const shown = items.filter((item) => item.category === choice.category);
  const picked = shown.filter((item) => choice.selected.includes(item.id) && quotes.get(item.id));
  const pickedQuotes = picked.flatMap((item) => quotes.get(item.id) ?? []);
  const totals = fleetTotals(pickedQuotes);
  const check = checkFleet(picked);

  const toggle = (id: string) =>
    setChoice((current) => ({
      ...current,
      selected: current.selected.includes(id)
        ? current.selected.filter((selectedId) => selectedId !== id)
        : [...current.selected, id],
    }));

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="fleet-items-heading"
        className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="fleet-items-heading" className="text-lg font-semibold">
          {t('fleet.step1')}
        </h2>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="block text-sm font-medium">
            {t('filters.category')}
            <select
              value={choice.category}
              onChange={(event) =>
                setChoice({
                  ...choice,
                  category: event.target.value as AssetCategory,
                  selected: [],
                })
              }
              className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {t(`category.${category}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {t('price.term')}
            <select
              value={choice.termMonths}
              onChange={(event) => setChoice({ ...choice, termMonths: Number(event.target.value) })}
              className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
            >
              {terms.map((term) => (
                <option key={term} value={term}>
                  {t('price.months', { months: term })}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">
            {t('fleet.pick', { max: MAX_FLEET_ITEMS })}
          </legend>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {shown.map((item) => {
              const quote = quotes.get(item.id);
              return (
                <li key={item.id}>
                  <label
                    className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                      quote
                        ? 'cursor-pointer border-stone-200 hover:border-emerald-400 dark:border-stone-700'
                        : 'border-stone-200 opacity-60 dark:border-stone-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(quote) && choice.selected.includes(item.id)}
                      disabled={!quote}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5 size-4 accent-emerald-700"
                    />
                    <span className="flex-1">
                      <span className="block font-medium">{item.name}</span>
                      <span className="block text-stone-600 dark:text-stone-400">
                        {item.id} · {t(`condition.${item.condition}`)} · {euro(item.listPriceCents)}
                      </span>
                      <span className="block tabular-nums">
                        {quote
                          ? t('fleet.itemRent', { net: euro(quote.monthlyNetCents) })
                          : t('fleet.cannotQuote')}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div aria-live="polite" className="mt-6 rounded-xl bg-stone-50 p-4 dark:bg-stone-800/60">
          <p className="font-semibold">
            {t('fleet.summary', { count: totals.count, months: choice.termMonths })}
          </p>
          <dl className="mt-2 grid gap-1 text-sm tabular-nums sm:grid-cols-2">
            <Line label={t('price.financed')} value={euro(totals.financedCents)} />
            <Line label={t('price.monthlyNet')} value={euro(totals.monthlyNetCents)} />
            <Line
              label={t('price.vat', { percent: formatNumber(vatPercent, locale) })}
              value={euro(totals.monthlyVatCents)}
            />
            <Line label={t('price.monthlyGross')} value={euro(totals.monthlyGrossCents)} />
            <Line label={t('price.totalGross')} value={euro(totals.totalGrossCents)} />
          </dl>
          {!check.ok ? (
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              {t(`fleet.check.${check.reason}`, { max: MAX_FLEET_ITEMS })}
            </p>
          ) : null}
        </div>
      </section>

      {check.ok ? (
        <section aria-labelledby="fleet-questions-heading">
          <h2 id="fleet-questions-heading" className="mb-4 text-lg font-semibold">
            {t('fleet.step2')}
          </h2>
          <ApplicationForm
            questions={props.questions}
            context={fleetQuestionContext({
              category: choice.category,
              termMonths: choice.termMonths,
              quotes: pickedQuotes,
              todayIso: today,
            })}
            deal={{ assetIds: picked.map((item) => item.id), termMonths: choice.termMonths }}
            initialAnswers={props.initialAnswers}
            viewerKey={props.viewerKey}
            locale={locale}
          />
        </section>
      ) : null}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
