import type { getBootstrap } from '@/server/spine-offers';
import { comparePriceOptions } from '@/domain/price-comparison';
import { parseCents } from '@/domain/money-arithmetic';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { buttonClass, Field, inputClass, panelClass } from './ui';
import { priceFailureMessage } from './price-feedback';
import { moneyInputText } from './form-values';
import { PriceExplanation } from './price-explanation';
import { PriceCalculation } from './price-calculation';
import { PriceBandNotice } from './price-band-notice';
import { PriceComparison } from './price-comparison';
import { PriceGuardian } from './price-guardian';

export type Bootstrap = Awaited<ReturnType<typeof getBootstrap>>;
export type TermDraft = { termMonths: number; downText: string; startDate: string };

type Props = {
  data: Bootstrap;
  locale: Locale;
  draft: TermDraft;
  busy: boolean;
  onChange: (draft: TermDraft) => void;
  onSave: (input: { termMonths: number; downPaymentCents: number; startDate: string }) => void;
};

export function PricePanel({ data, locale, draft, busy, onChange, onSave }: Props) {
  const t = getT(locale);
  if (!data.offer || data.asset.status !== 'available') {
    return <p className={panelClass}>{t('spine.unavailable')}</p>;
  }
  const terms = Object.keys(data.coefficientTable.end_of_term_buyout_percent_of_financed)
    .map(Number)
    .sort((a, b) => a - b);
  const down = parseCents(draft.downText);
  const startDate = draft.startDate || data.businessDate;
  const option = down.ok
    ? comparePriceOptions({
        listPriceCents: data.offer.priceCents,
        downPaymentCents: down.cents,
        termMonths: [draft.termMonths],
        table: data.coefficientTable,
        startDate,
        upfrontDate: data.businessDate,
        vatRates: data.vatRates,
      })[0]
    : null;
  const reason = !down.ok ? 'invalid_money' : option && !option.ok ? option.reason : null;
  const error = reason ? priceFailureMessage(reason, data, locale) : null;
  const amountInvalid = [
    'invalid_money',
    'invalid_down_payment',
    'below_minimum',
    'above_maximum',
  ].includes(reason ?? '');
  const dateInvalid = reason === 'invalid_date';
  const termInvalid = reason === 'invalid_term' || reason === 'unknown_term';
  const price = option?.ok ? option.explanation.terms : null;
  const maxDown = Math.max(
    0,
    data.offer.priceCents - (data.coefficientTable.bands[0]?.min_financed_cents ?? 0)
  );

  return (
    <form
      className={panelClass + ' price-workbench'}
      aria-labelledby="terms-heading"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (down.ok && option?.ok && !busy)
          onSave({
            termMonths: draft.termMonths,
            downPaymentCents: down.cents,
            startDate,
          });
      }}
    >
      <div className="price-section-title">
        <span aria-hidden="true" className="step-mark">
          01
        </span>
        <h2 id="terms-heading" className="text-2xl font-semibold tracking-tight">
          {t('spine.terms')}
        </h2>
      </div>
      <div className="price-layout">
        <fieldset disabled={busy} className="price-controls space-y-6">
          <legend className="sr-only">{t('spine.terms')}</legend>
          <Field id="term-select" label={t('spine.term')}>
            <select
              id="term-select"
              name="termMonths"
              className={inputClass}
              value={terms.includes(draft.termMonths) ? draft.termMonths : ''}
              aria-invalid={termInvalid}
              aria-describedby={termInvalid ? 'price-feedback' : undefined}
              onChange={(event) => onChange({ ...draft, termMonths: Number(event.target.value) })}
            >
              <option value="" disabled>
                {t('explain.chooseTerm')}
              </option>
              {terms.map((term) => (
                <option key={term} value={term}>
                  {t('spine.months', { count: term })}
                </option>
              ))}
            </select>
            <input
              id="term"
              aria-label={t('spine.term')}
              type="range"
              className="mt-2 w-full"
              min={0}
              max={terms.length - 1}
              step={1}
              value={Math.max(0, terms.indexOf(draft.termMonths))}
              aria-invalid={termInvalid}
              aria-describedby={termInvalid ? 'price-feedback' : undefined}
              aria-valuetext={t('spine.months', { count: draft.termMonths })}
              onChange={(event) =>
                onChange({ ...draft, termMonths: terms[Number(event.target.value)] ?? 12 })
              }
            />
          </Field>
          <Field id="down" label={t('spine.down')}>
            <input
              id="down"
              name="downPayment"
              className={inputClass}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={draft.downText}
              aria-invalid={amountInvalid}
              aria-describedby={
                amountInvalid
                  ? 'down-help down-band-help price-feedback'
                  : 'down-help down-band-help'
              }
              onChange={(event) => onChange({ ...draft, downText: event.target.value })}
            />
            <input
              aria-label={t('spine.down')}
              type="range"
              className="mt-2 w-full"
              min={0}
              max={maxDown}
              step={1}
              value={down.ok ? Math.max(0, Math.min(maxDown, down.cents)) : 0}
              aria-invalid={amountInvalid}
              aria-describedby={amountInvalid ? 'down-help price-feedback' : 'down-help'}
              aria-valuetext={down.ok ? formatEuro(down.cents, intlLocale[locale]) : draft.downText}
              onChange={(event) =>
                onChange({ ...draft, downText: String(Number(event.target.value) / 100) })
              }
            />
            <p id="down-help" className="ui-note mt-2">
              {t('spine.downHelp')}
            </p>
            <div id="down-band-help" className="mt-3">
              <details className="price-control-details">
                <summary>{t('explain.bandInfoSummary')}</summary>
                <p className="ui-note mt-2">{t('spine.bandHelp')}</p>
              </details>
              {price ? (
                <PriceBandNotice terms={price} table={data.coefficientTable} locale={locale} />
              ) : null}
            </div>
          </Field>
          <Field id="start" label={t('spine.start')}>
            <input
              id="start"
              name="startDate"
              type="date"
              className={inputClass}
              value={startDate}
              min={data.businessDate}
              aria-invalid={dateInvalid}
              aria-describedby={dateInvalid ? 'price-feedback' : undefined}
              onChange={(event) => onChange({ ...draft, startDate: event.target.value })}
            />
          </Field>
          {error ? (
            <p id="price-feedback" role="status" className="ui-feedback">
              {error}
            </p>
          ) : null}
        </fieldset>
        <div className="price-outcomes min-w-0">
          {price && option?.ok ? (
            <>
              <PriceExplanation
                explanation={option.explanation}
                pricedOn={data.businessDate}
                priceSource={data.offer.source}
                upfrontDate={data.businessDate}
                locale={locale}
                showCalculation={false}
              />
              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {t('spine.monthlyGross', { date: startDate })}:{' '}
                {formatEuro(option.explanation.firstRent.grossCents, intlLocale[locale])}
              </p>
              <p className="ui-note mt-4">{t('spine.endHelp')}</p>
            </>
          ) : null}
        </div>
        {price && option?.ok ? (
          <div className="price-basis min-w-0">
            <PriceCalculation
              explanation={option.explanation}
              locale={locale}
              pricedOn={data.businessDate}
              priceSource={data.offer.source}
            />
          </div>
        ) : null}
      </div>
      <PriceGuardian
        input={
          down.ok && option?.ok
            ? {
                listPriceCents: data.offer.priceCents,
                downPaymentCents: down.cents,
                termMonths: draft.termMonths,
                table: data.coefficientTable,
                startDate,
                upfrontDate: data.businessDate,
                vatRates: data.vatRates,
              }
            : null
        }
        locale={locale}
        busy={busy}
        onChoose={(downPaymentCents) => {
          if (busy) return;
          onChange({ ...draft, downText: moneyInputText(downPaymentCents) });
          document.getElementById('down')?.focus();
        }}
      />
      <PriceComparison
        data={data}
        locale={locale}
        draft={draft}
        busy={busy}
        onChoose={(termMonths) => onChange({ ...draft, termMonths })}
      />
      <div className="price-actions">
        <button
          id="save-quote"
          type="submit"
          className={buttonClass}
          disabled={busy || !option?.ok}
          aria-describedby="save-help"
        >
          {busy ? t('spine.pending') : t('spine.saveQuote')}
        </button>
        <p id="save-help" className="ui-note">
          {t('explain.saveHelp')}
        </p>
      </div>
    </form>
  );
}
