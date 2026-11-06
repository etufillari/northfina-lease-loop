import { useId } from 'react';
import { z } from 'zod';
import { comparePriceOptions } from '@/domain/price-comparison';
import type { PriceExplanation } from '@/domain/price-explanation';
import { isIsoDate } from '@/domain/calendar';
import { formatEuro } from '@/domain/money';
import { parseCents } from '@/domain/money-arithmetic';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { Bootstrap, TermDraft } from './price-panel';
import { priceFailureMessage } from './price-feedback';
import { priceSourceLabel } from './price-explanation';
import { useDraft } from './use-draft';
import { Field, inputClass, secondaryButtonClass } from './ui';

const comparisonSchema = z.tuple([z.number().int().positive(), z.number().int().positive()]);

type Props = {
  data: Bootstrap;
  locale: Locale;
  draft: TermDraft;
  busy: boolean;
  onChoose: (termMonths: number) => void;
};

export function PriceComparison({ data, locale, draft, busy, onChoose }: Props) {
  const t = getT(locale);
  const id = useId();
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const availableTerms = Object.keys(data.coefficientTable.end_of_term_buyout_percent_of_financed)
    .map(Number)
    .sort((a, b) => a - b);
  const initialLeft = availableTerms.includes(24) ? 24 : (availableTerms[0] ?? 24);
  const initialRight = availableTerms.includes(36)
    ? 36
    : (availableTerms.find((term) => term !== initialLeft) ?? initialLeft);
  const defaults: [number, number] = [initialLeft, initialRight];
  const [preferences, savePreferences, volatile] = useDraft(
    'lease-loop-compare:' + data.asset.id + ':' + data.customer.id,
    defaults,
    comparisonSchema
  );
  const left = availableTerms.includes(preferences[0]) ? preferences[0] : initialLeft;
  const right =
    availableTerms.includes(preferences[1]) && preferences[1] !== left
      ? preferences[1]
      : (availableTerms.find((term) => term !== left) ?? left);
  const chosenTerms: [number, number] = [left, right];
  const down = parseCents(draft.downText);
  const startDate = draft.startDate || data.businessDate;
  const options =
    data.offer && down.ok && isIsoDate(data.businessDate)
      ? comparePriceOptions({
          listPriceCents: data.offer.priceCents,
          downPaymentCents: down.cents,
          termMonths: chosenTerms,
          table: data.coefficientTable,
          startDate,
          upfrontDate: data.businessDate,
          vatRates: data.vatRates,
        })
      : null;
  const rows: { label: MessageKey; value: (model: PriceExplanation) => string }[] = [
    { label: 'explain.upfrontGross', value: (model) => money(model.upfront.grossCents) },
    { label: 'spine.forecastRentGross', value: (model) => money(model.rentGrossCents) },
    { label: 'spine.forecastUseGross', value: (model) => money(model.useGrossCents) },
    { label: 'explain.buyoutGross', value: (model) => money(model.buyout.grossCents) },
    { label: 'spine.forecastOwnGross', value: (model) => money(model.ownGrossCents) },
  ];

  return (
    <section className="price-comparison space-y-5" aria-labelledby={id + '-heading'}>
      <div className="price-section-title">
        <span aria-hidden="true" className="step-mark">
          02
        </span>
        <div>
          <h3 id={id + '-heading'} className="text-2xl font-semibold tracking-tight">
            {t('explain.compareTitle')}
          </h3>
          <p className="ui-note mt-2">{t('explain.compareHelp')}</p>
        </div>
      </div>
      {data.offer && isIsoDate(data.businessDate) ? (
        <div>
          <p className="ui-note">
            {t('explain.source', {
              source: priceSourceLabel(data.offer.source, locale),
              date: formatIsoDate(data.businessDate, locale),
            })}
          </p>
          <dl className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="ui-note">{t('spine.list')}</dt>
              <dd className="font-semibold tabular-nums">{money(data.offer.priceCents)}</dd>
            </div>
            {down.ok ? (
              <div>
                <dt className="ui-note">{t('spine.down')}</dt>
                <dd className="font-semibold tabular-nums">{money(down.cents)}</dd>
              </div>
            ) : null}
            {isIsoDate(startDate) ? (
              <div>
                <dt className="ui-note">{t('spine.start')}</dt>
                <dd className="font-semibold">{formatIsoDate(startDate, locale)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
      {volatile ? <p role="status">{t('spine.storageWarning')}</p> : null}
      {!options ? (
        <p role="status" className="ui-feedback">
          {!data.offer
            ? t('spine.unavailable')
            : !isIsoDate(data.businessDate)
              ? t('explain.invalidBusinessDate')
              : priceFailureMessage('invalid_money', data, locale)}
        </p>
      ) : null}
      <div className="comparison-options">
        {chosenTerms.map((term, index) => {
          const option = options?.[index];
          const selected = term === draft.termMonths;
          const headingId = id + '-option-' + index;
          return (
            <article
              key={index}
              className="comparison-option"
              aria-labelledby={headingId}
              data-selected={selected && !!option?.ok}
            >
              <Field
                id={id + '-term-' + index}
                label={t('explain.compareOption', { number: formatNumber(index + 1, locale) })}
              >
                <select
                  id={id + '-term-' + index}
                  name={'comparisonTerm' + index}
                  className={inputClass}
                  disabled={busy}
                  value={term}
                  onChange={(event) => {
                    const next: [number, number] = [...chosenTerms];
                    next[index] = Number(event.target.value);
                    savePreferences(next);
                  }}
                >
                  {availableTerms.map((candidate) => (
                    <option
                      key={candidate}
                      value={candidate}
                      disabled={candidate === chosenTerms[1 - index] && availableTerms.length > 1}
                    >
                      {t('spine.months', { count: formatNumber(candidate, locale) })}
                    </option>
                  ))}
                </select>
              </Field>
              <h4 id={headingId} className="mt-5 text-xl font-semibold">
                {t('spine.months', { count: formatNumber(term, locale) })}
              </h4>
              {option?.ok ? (
                <>
                  <div className="my-4">
                    <p className="ui-note">{t('explain.firstPayment')}</p>
                    <p className="price-number">{money(option.explanation.firstRent.grossCents)}</p>
                    <p className="ui-note mt-2">
                      {t('explain.fixedNet', {
                        amount: money(option.explanation.terms.monthlyNetCents),
                      })}
                    </p>
                  </div>
                  <dl className="mb-5 divide-y divide-stone-200 dark:divide-stone-700">
                    {rows.map((row) => (
                      <div key={row.label} className="price-row">
                        <dt>{t(row.label)}</dt>
                        <dd>{row.value(option.explanation)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : option ? (
                <p role="status" className="ui-feedback my-4">
                  {priceFailureMessage(option.reason, data, locale)}
                </p>
              ) : null}
              <div className="mt-auto pt-3">
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={busy || !option?.ok || selected}
                  aria-pressed={selected}
                  onClick={() => onChoose(term)}
                >
                  {selected
                    ? t('explain.selectedTerm')
                    : t('explain.useTerm', { months: formatNumber(term, locale) })}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {options && isIsoDate(startDate) ? (
        <p className="ui-note">
          {t('explain.comparisonTiming', { date: formatIsoDate(startDate, locale) })}
        </p>
      ) : null}
      <p className="ui-note">{t('explain.comparisonHelp')}</p>
    </section>
  );
}
