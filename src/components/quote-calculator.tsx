'use client';

// The price sliders for one item (D8): term and down payment. Each change asks GET /api/quotes/preview
// (debounced, the previous request aborted) and shows the breakdown and the term comparison the
// server priced; the browser never computes a price. "Apply at this price" stores the quote
// (POST /api/quotes, which locks the price for 14 days, D7) and goes straight to the
// application, so the lock is part of applying rather than a step of its own.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { type QuoteBreakdown, type QuoteRefusal, type TermComparison } from '@/domain/pricing';
import { getT } from '@/i18n/get-t';
import { formatEuro } from '@/domain/money';
import { parseEurosToCents } from '@/domain/question-flow/answers';
import { intlLocale, type Locale } from '@/i18n/locales';
import { formatBasisPoints, QuoteBreakdownList, refusalText } from './quote-breakdown';
import { termControl } from './quote-terms';
import { Button, cx, Disclosure, Field, Money, Notice, PriceTag } from './ui';

export type QuotePreviewData = {
  today: string;
  quote: QuoteBreakdown | null;
  refusal: QuoteRefusal | null;
  comparison: TermComparison;
};

type QuoteCalculatorProps = {
  assetId: string;
  locale: Locale;
  /** The terms this item may be offered, shortest first: the table's under its category's cap (D43). */
  terms: number[];
  /** Why the slider stops short of the table's longest term, when it does. */
  termNote?: string;
  /** Today's net list price of the item, for the down-payment slider's range. */
  unitPriceCents: number;
  initial: { termMonths: number; downPaymentCents: number };
  initialPreview: QuotePreviewData;
  /** False when the asset is reserved or returned: the price shows, the button does not. */
  canQuote: boolean;
  /** The item itself (its drawing and facts), shown beside the price panel. */
  children?: ReactNode;
};

const DEBOUNCE_MS = 200;

/**
 * The down payment moves in steps of 1 % of the price, rounded to whole euros. When the page
 * opens on a preset that is not on that grid (the catalogue's 10 000 € for a 260 000 € item,
 * whose 1 % step is 2 600 €), it moves in whole euros instead, so the slider can show the
 * preset exactly and get back to it.
 */
/**
 * Cents as an amount to edit in the down-payment box: whole euros ("10000"), or with the
 * cents after the page language's decimal mark ("10000.50", "10000,50"). No grouping, so
 * `parseEurosToCents` reads back exactly what it shows.
 */
function centsToInput(cents: number, locale: Locale): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  if (rest === 0) return String(euros);
  return `${euros}${locale === 'en' ? '.' : ','}${String(rest).padStart(2, '0')}`;
}

function downPaymentStep(totalCents: number, presetCents: number): number {
  const percent = Math.max(100, Math.round(totalCents / 100 / 100) * 100);
  return presetCents % percent === 0 ? percent : 100;
}

export function QuoteCalculator(props: QuoteCalculatorProps) {
  const { assetId, locale, terms, termNote, unitPriceCents, initialPreview, canQuote } = props;
  const t = getT(locale);
  const router = useRouter();
  const ids = useId();
  const [termIndex, setTermIndex] = useState(Math.max(0, terms.indexOf(props.initial.termMonths)));
  const [downPaymentCents, setDownPaymentCents] = useState(props.initial.downPaymentCents);
  // What the visitor is typing in the down-payment box. It drives the price whenever it reads
  // as an amount; on leaving the box it is rewritten from the amount actually used.
  const [downDraft, setDownDraft] = useState(() =>
    centsToInput(props.initial.downPaymentCents, locale)
  );
  const [preview, setPreview] = useState(initialPreview);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstRun = useRef(true);

  const termMonths = terms[termIndex] ?? terms[0]!;
  const totalPriceCents = unitPriceCents;
  const step = downPaymentStep(totalPriceCents, props.initial.downPaymentCents);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const query = new URLSearchParams({
        assetId,
        termMonths: String(termMonths),
        downPaymentCents: String(downPaymentCents),
      });
      try {
        const response = await fetch(`/api/quotes/preview?${query}`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error('preview failed');
        setPreview(body.data as QuotePreviewData);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [assetId, termMonths, downPaymentCents]);

  function setDown(cents: number) {
    setDownPaymentCents(cents);
    setDownDraft(centsToInput(cents, locale));
  }

  /** A typed amount above the price is held at the price, which the preview then refuses. */
  function onDownTyped(value: string) {
    setDownDraft(value);
    const cents = parseEurosToCents(value);
    if (cents !== null) setDownPaymentCents(Math.min(cents, totalPriceCents));
  }

  function apply() {
    setSubmitError(null);
    startTransition(async () => {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId, termMonths, downPaymentCents }),
      }).catch(() => null);
      const body = await response?.json().catch(() => null);
      if (response?.ok && body?.success) {
        router.push(`/${locale}/apply/${body.data.id}`);
        return;
      }
      const reason = body?.error?.details;
      setSubmitError(
        reason?.code ? refusalText(t, reason, locale) : t('pricing.calculator.submitFailed')
      );
    });
  }

  const quote = preview.quote;
  const money = (cents: number) => <Money cents={cents} locale={locale} />;

  // The box keeps its full height on every screen. It stays pinned beside the item only while
  // the whole of it fits in the window (24 px above and below); on a shorter window it scrolls
  // with the page, so "Apply at this price" at its bottom is never cut off.
  const boxRef = useRef<HTMLElement>(null);
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const check = () => setFits(box.offsetHeight + 48 <= window.innerHeight);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(box);
    window.addEventListener('resize', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  return (
    <div className="space-y-12">
      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12">
        <div>{props.children}</div>

        <section
          ref={boxRef}
          aria-labelledby={`${ids}-title`}
          className={cx(
            'rounded-xl bg-raised p-4 shadow-panel sm:p-6',
            fits && 'md:sticky md:top-6'
          )}
        >
          <h2 id={`${ids}-title`} className="sr-only">
            {t('pricing.calculator.title')}
          </h2>
          <div aria-live="polite">
            <PriceTag
              label={t('pricing.calculator.youPay')}
              flipKey={quote?.monthlyGrossCents}
              amount={quote ? money(quote.monthlyGrossCents) : '–'}
              sub={
                loading
                  ? t('pricing.calculator.updating')
                  : quote
                    ? t('pricing.calculator.tagSub', {
                        months: termMonths,
                        rate: formatBasisPoints(quote.vatRateBasisPoints, locale),
                      })
                    : t('pricing.calculator.inclVat')
              }
              lines={
                quote
                  ? [
                      {
                        label: t('pricing.tag.total', { months: termMonths }),
                        value: money(quote.totalIfReturnCents),
                      },
                      { label: t('pricing.tag.buyout'), value: money(quote.buyoutGrossCents) },
                    ]
                  : undefined
              }
            />
            {quote ? (
              <p className="mt-3 text-sm text-ink-muted">
                {t('pricing.tag.note', { months: termMonths })}
              </p>
            ) : null}
          </div>

          <div className="mt-6 space-y-6">
            <Field id={`${ids}-term`} label={t('pricing.calculator.term')} hint={termNote}>
              {(control) =>
                // One allowed term is a fact, not a choice: a line instead of a 0-to-0 slider.
                termControl(terms) === 'static' ? (
                  <p
                    id={control.id}
                    className="mb-1 font-heading text-2xl font-semibold tabular-nums"
                    data-testid="term-static"
                  >
                    {t('pricing.months', { months: termMonths })}
                  </p>
                ) : (
                  <div>
                    <p
                      className="mb-1 font-heading text-2xl font-semibold tabular-nums"
                      aria-hidden="true"
                    >
                      {t('pricing.months', { months: termMonths })}
                    </p>
                    <input
                      {...control}
                      type="range"
                      min={0}
                      max={terms.length - 1}
                      step={1}
                      value={termIndex}
                      aria-valuetext={t('pricing.months', { months: termMonths })}
                      onChange={(e) => setTermIndex(Number(e.target.value))}
                      className="h-11 w-full"
                    />
                    <div className="flex justify-between text-xs text-ink-muted" aria-hidden="true">
                      {terms.map((term) => (
                        <span key={term}>{term}</span>
                      ))}
                    </div>
                  </div>
                )
              }
            </Field>

            <Field
              id={`${ids}-down`}
              label={t('pricing.calculator.downPayment')}
              hint={t('pricing.calculator.downPaymentHint')}
            >
              {(control) => (
                <div>
                  <div className="mb-1 flex max-w-60 items-center gap-2 rounded-md border-2 border-neutral-solid bg-raised px-3 focus-within:border-brand">
                    {locale === 'en' ? <EuroSign /> : null}
                    <input
                      {...control}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={downDraft}
                      onChange={(e) => onDownTyped(e.target.value)}
                      onBlur={() => setDownDraft(centsToInput(downPaymentCents, locale))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setDownDraft(centsToInput(downPaymentCents, locale));
                      }}
                      className="min-h-11 w-full min-w-0 bg-transparent py-1 font-heading text-2xl font-semibold tabular-nums outline-none"
                    />
                    {locale === 'en' ? null : <EuroSign />}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={totalPriceCents}
                    step={step}
                    value={downPaymentCents}
                    aria-label={t('pricing.calculator.downPaymentSlider')}
                    aria-valuetext={formatEuro(downPaymentCents, intlLocale[locale])}
                    onChange={(e) => setDown(Number(e.target.value))}
                    className="h-11 w-full"
                  />
                </div>
              )}
            </Field>

            {failed ? <Notice tone="error">{t('pricing.calculator.previewFailed')}</Notice> : null}
            {preview.refusal ? (
              <Notice tone="warning" live>
                {refusalText(t, preview.refusal, locale)}
              </Notice>
            ) : null}

            {canQuote ? (
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={apply}
                disabled={!quote || loading}
                pending={pending}
                pendingLabel={t('pricing.calculator.saving')}
              >
                {t('pricing.calculator.apply')} <span aria-hidden="true">→</span>
              </Button>
            ) : (
              <Notice tone="info">{t('pricing.calculator.notAvailable')}</Notice>
            )}
            {submitError ? (
              <Notice tone="error" live>
                {submitError}
              </Notice>
            ) : null}
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <Disclosure
          title={t('pricing.breakdown.title')}
          summary={t('pricing.breakdown.summary')}
          // Opened by a catalogue preset (e.g. the down payment an item needs): show why.
          defaultOpen={props.initial.downPaymentCents > 0}
        >
          {quote ? (
            <QuoteBreakdownList quote={quote} locale={locale} t={t} />
          ) : (
            <p className="text-ink-muted">{t('pricing.breakdown.none')}</p>
          )}
        </Disclosure>
        <Disclosure
          title={t('pricing.compare.title')}
          summary={t('pricing.compare.summary', { terms: terms.join(', ') })}
          padded={false}
        >
          <TermTable comparison={preview.comparison} selected={termMonths} locale={locale} />
        </Disclosure>
      </div>
    </div>
  );
}

function TermTable({
  comparison,
  selected,
  locale,
}: {
  comparison: TermComparison;
  selected: number;
  locale: Locale;
}) {
  const t = getT(locale);
  const money = (cents: number) => <Money cents={cents} locale={locale} />;
  const head = 'px-4 py-3 text-right align-bottom font-bold sm:px-6';
  const cell = 'px-4 py-3 text-right sm:px-6';
  return (
    <>
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('pricing.compare.title')}</caption>
          <thead className="text-ink-muted">
            <tr className="border-b-2 border-line">
              <th scope="col" className={head.replace('text-right', 'text-left')}>
                {t('pricing.compare.term')}
              </th>
              <th scope="col" className={head}>
                {t('pricing.compare.gross')}
              </th>
              <th scope="col" className={head}>
                {t('pricing.compare.totalIfReturn')}
              </th>
              <th scope="col" className={head}>
                {t('pricing.compare.buyout')}
              </th>
              <th scope="col" className={head}>
                {t('pricing.compare.totalIfBuy')}
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {comparison.rows.map((row) => (
              <tr
                key={row.termMonths}
                className={
                  row.termMonths === selected
                    ? 'border-b border-line bg-brand-soft font-bold'
                    : 'border-b border-line'
                }
                aria-current={row.termMonths === selected ? 'true' : undefined}
              >
                <th scope="row" className="px-4 py-3 text-left whitespace-nowrap sm:px-6">
                  {t('pricing.months', { months: row.termMonths })}
                </th>
                <td className={`${cell} text-base font-bold text-brand-text`}>
                  {money(row.monthlyGrossCents)}
                </td>
                <td className={cell}>{money(row.totalIfReturnCents)}</td>
                <td className={cell}>{money(row.buyoutGrossCents)}</td>
                <td className={cell}>{money(row.totalIfBuyCents)}</td>
              </tr>
            ))}
            {comparison.unavailable.map(({ termMonths, reason }) => (
              <tr key={termMonths} className="border-b border-line text-ink-muted">
                <th scope="row" className="px-4 py-3 text-left whitespace-nowrap sm:px-6">
                  {t('pricing.months', { months: termMonths })}
                </th>
                <td colSpan={4} className="px-4 py-3 sm:px-6">
                  {refusalText(t, reason, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EuroSign() {
  return (
    <span aria-hidden="true" className="font-heading text-2xl font-semibold text-ink-muted">
      €
    </span>
  );
}
