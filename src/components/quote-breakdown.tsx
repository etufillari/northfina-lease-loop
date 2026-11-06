// "Explain my price": the breakdown of one quote in three short sums, in words a 17-year-old and a
// 70-year-old can both follow. No hooks, so the price page (server) and the calculator
// (client) render the same lines. The numbers come from the domain; this only writes them.
import { assetCategorySchema } from '@/data/schemas';
import type { QuoteBreakdown, QuoteRefusal } from '@/domain/pricing';
import { formatEuro } from '@/domain/money';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ReactNode } from 'react';
import { Money, cx } from './ui';

/** 27 584 millionths → "0.027584" in the page's language. */
export function formatFactor(millionths: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(millionths / 1_000_000);
}

/**
 * The factor as the share of the financed amount paid each month, for the customer's step 2:
 * 27 584 millionths → "2.7584" (the message adds the % sign). All four decimals are kept, so the
 * sum on the page (financed × 2.7584 %) gives the cents the domain computed.
 */
export function formatMonthlySharePercent(millionths: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(millionths / 10_000);
}

/** 2550 basis points → "25.5" in the page's language (the message adds the % sign). */
export function formatBasisPoints(basisPoints: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 2 }).format(
    basisPoints / 100
  );
}

/** A refusal code with its params as a sentence; amounts in cents are written as euros. */
export function refusalText(
  t: Translate,
  refusal: Pick<QuoteRefusal, 'code'> & { params: Record<string, unknown> },
  locale: Locale
): string {
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(refusal.params)) {
    if (name.endsWith('Cents') && typeof value === 'number') {
      values[name] = formatEuro(value, intlLocale[locale]);
    } else if (name === 'category' && typeof value === 'string') {
      // The category is a code; the page writes its name (D43's refusal names the category).
      const category = assetCategorySchema.safeParse(value);
      values[name] = category.success ? t(`category.${category.data}`) : value;
    } else if (Array.isArray(value)) {
      values[name] = value.join(', ');
    } else if (typeof value === 'string' || typeof value === 'number') {
      values[name] = value;
    }
  }
  const known = [
    'below_minimum',
    'above_maximum',
    'unknown_term',
    'term_over_category_max',
    'unknown_asset',
    'no_price_list_on_date',
    'down_payment_too_high',
    'invalid_down_payment',
    'no_vat_rate_on_date',
    'asset_not_available',
  ] as const;
  const code = known.find((c) => c === refusal.code);
  return code ? t(`pricing.refusal.${code}`, values) : t('pricing.refusal.other');
}

type QuoteBreakdownListProps = { quote: QuoteBreakdown; locale: Locale; t: Translate };

/** One line of a sum: an operator, a label (and a quiet hint), the amount. */
type SumLine = {
  op?: '−' | '×' | '+' | '=';
  label: string;
  hint?: string;
  value: ReactNode;
  /** The line the step arrives at: bold, above a rule. */
  result?: boolean;
};

/**
 * "Explain my price" as three short sums a 17-year-old and a 70-year-old can both follow:
 * what we finance, what that costs a month, what it costs in total. Each step ends on the
 * number the next one starts from. Every amount is the domain's; the only arithmetic here is
 * the rents' share of the total (total if returned − the down payment with VAT), which is
 * exact in integer cents.
 */
export function QuoteBreakdownList({ quote, locale, t }: QuoteBreakdownListProps) {
  const money = (cents: number) => <Money cents={cents} locale={locale} />;
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const rentsCents = quote.totalIfReturnCents - quote.downPaymentGrossCents;

  const finance: SumLine[] = [
    { label: t('pricing.line.unitPrice'), value: money(quote.listPriceCents) },
  ];
  if (quote.downPaymentCents > 0) {
    finance.push({
      op: '−',
      label: t('pricing.line.downPayment'),
      value: money(quote.downPaymentCents),
    });
  }
  finance.push({
    op: '=',
    label: t('pricing.line.financed'),
    value: money(quote.financedCents),
    result: true,
  });

  const monthly: SumLine[] = [
    { label: t('pricing.line.financed'), value: money(quote.financedCents) },
    {
      op: '×',
      // Not "factor" and not "rate": the share of the amount paid each month, interest included.
      label: t('pricing.explain.monthlyShare'),
      hint: t('pricing.explain.monthlyShareHint'),
      value: t('pricing.explain.percent', {
        percent: formatMonthlySharePercent(quote.factorMillionths, locale),
      }),
    },
    { op: '=', label: t('pricing.line.net'), value: money(quote.monthlyNetCents) },
    {
      op: '+',
      label: t('pricing.line.vat', { rate: formatBasisPoints(quote.vatRateBasisPoints, locale) }),
      value: money(quote.monthlyVatCents),
    },
    {
      op: '=',
      label: t('pricing.line.gross'),
      value: money(quote.monthlyGrossCents),
      result: true,
    },
  ];

  const total: SumLine[] = [];
  if (quote.downPaymentCents > 0) {
    total.push({ label: t('pricing.explain.atStart'), value: money(quote.downPaymentGrossCents) });
  }
  total.push(
    {
      op: total.length > 0 ? '+' : undefined,
      label: t('pricing.explain.payments', { months: quote.termMonths }),
      hint: `${quote.termMonths} × ${euro(quote.monthlyGrossCents)}`,
      value: money(rentsCents),
    },
    {
      op: '=',
      label: t('pricing.line.totalIfReturn'),
      value: money(quote.totalIfReturnCents),
      result: true,
    },
    {
      op: '+',
      label: t('pricing.explain.buyout'),
      hint: t('pricing.explain.buyoutShare', {
        percent: formatBasisPoints(quote.buyoutPercentBasisPoints, locale),
      }),
      value: money(quote.buyoutGrossCents),
    },
    {
      op: '=',
      label: t('pricing.line.totalIfBuy'),
      value: money(quote.totalIfBuyCents),
      result: true,
    }
  );

  return (
    <>
      <ol className="grid gap-4 xl:grid-cols-3">
        <SumStep
          n={1}
          title={t('pricing.explain.step1')}
          lines={finance}
          note={t('pricing.explain.step1Note')}
        />
        <SumStep
          n={2}
          title={t('pricing.explain.step2')}
          lines={monthly}
          note={t('pricing.explain.step2Note')}
        />
        <SumStep
          n={3}
          title={t('pricing.explain.step3')}
          lines={total}
          note={t('pricing.explain.step3Note')}
        />
      </ol>
      <p className="mt-4 text-xs text-ink-muted">{t('pricing.vatEstimate')}</p>
    </>
  );
}

function SumStep({
  n,
  title,
  lines,
  note,
}: {
  n: number;
  title: string;
  lines: SumLine[];
  note: string;
}) {
  return (
    <li className="flex flex-col rounded-lg bg-muted p-4 sm:p-5">
      <h3 className="flex items-center gap-3 text-lg">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand font-heading text-base font-semibold text-brand-contrast"
        >
          {n}
        </span>
        {title}
      </h3>
      <dl className="mt-4 max-w-lg space-y-2 tabular-nums">
        {lines.map((line, index) => (
          <div
            key={index}
            className={cx(
              'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2',
              line.result && 'border-t-2 border-ink/70 pt-2 font-bold'
            )}
          >
            <span aria-hidden="true" className="text-ink-muted">
              {line.op ?? ''}
            </span>
            <dt>
              {line.label}
              {line.hint ? (
                <span className="block text-xs font-normal text-ink-muted">{line.hint}</span>
              ) : null}
            </dt>
            <dd className="text-right whitespace-nowrap">{line.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto max-w-lg pt-4 text-sm text-ink-muted">{note}</p>
    </li>
  );
}
