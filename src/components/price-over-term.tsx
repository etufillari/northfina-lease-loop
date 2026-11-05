// What a lease costs with VAT over its whole term, before signing (Smart Problems 1 and 6): every
// month the invoice changes because VAT does, and the gross total of all invoices. Built from the
// domain's own schedule, so it is the same arithmetic as the contract's invoices (D-018, D-037).
// No hooks: the calculator renders it in the browser, the quote page on the server.
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { invoiceSchedule, vatSteps } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { quoteLease } from '@/domain/pricing';
import { DEFAULT_BILLING_RULE } from '@/domain/pricing-rules';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export interface PriceOverTermProps {
  locale: Locale;
  vatRates: VatRates;
  /** The lease is assumed to start on this day (signing starts it the same day). */
  startDate: string;
  termMonths: number;
  monthlyNetRentCents: number;
  downPaymentCents: number;
  /** `stage` for the dark quote panel, `plain` for the calculator. */
  tone: 'stage' | 'plain';
}

export function PriceOverTerm(props: PriceOverTermProps) {
  const { locale } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const schedule = invoiceSchedule(
    {
      startDate: props.startDate,
      termMonths: props.termMonths,
      monthlyNetRentCents: props.monthlyNetRentCents,
      downPaymentCents: props.downPaymentCents,
      billing: DEFAULT_BILLING_RULE,
    },
    props.vatRates
  );
  if (!schedule.ok) return null;
  const steps = vatSteps(schedule, props.vatRates);
  const muted = props.tone === 'stage' ? 'text-stage-muted' : 'text-muted';
  const callout =
    props.tone === 'stage' ? 'bg-white/10 ring-white/20' : 'bg-warn-bg text-warn-fg ring-warn-line';

  return (
    <div className="mt-4 space-y-3 text-sm">
      {steps.map((step) => (
        <p key={step.firstInvoiceDate} className={`rounded-md p-3 ring-1 ring-inset ${callout}`}>
          <strong className="font-semibold">
            {t('lease.vatStep', { date: date(step.validFrom), gross: euro(step.grossCents) })}
          </strong>
          <br />
          {t('lease.vatStepNote', {
            rate: formatNumber(step.vatRatePercent, locale),
            invoiceDate: date(step.firstInvoiceDate),
            net: euro(step.netCents),
          })}
        </p>
      ))}
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">{t('lease.totalGross')}</span>
        <span className="font-semibold tabular-nums">{euro(schedule.totals.grossCents)}</span>
      </div>
      <p className={`text-xs ${muted}`}>
        {t(schedule.downPayment ? 'lease.totalGrossNoteDown' : 'lease.totalGrossNote', {
          date: date(props.startDate),
          count: props.termMonths,
        })}
      </p>
    </div>
  );
}

/**
 * Every term side by side for the same down payment (Smart Problem 6): a shorter lease costs more
 * a month but less in total. Each row is priced and invoiced by the same domain code.
 */
export function TermComparison(props: {
  locale: Locale;
  table: CoefficientTable;
  vatRates: VatRates;
  startDate: string;
  listPriceCents: number;
  downPaymentCents: number;
  terms: readonly number[];
  selectedTerm: number;
}) {
  const { locale } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const rows = props.terms.flatMap((termMonths) => {
    const quote = quoteLease(props.table, {
      listPriceCents: props.listPriceCents,
      termMonths,
      downPaymentCents: props.downPaymentCents,
    });
    if (!quote.ok) return [];
    const schedule = invoiceSchedule(
      {
        startDate: props.startDate,
        termMonths,
        monthlyNetRentCents: quote.monthlyNetRentCents,
        downPaymentCents: props.downPaymentCents,
        billing: DEFAULT_BILLING_RULE,
      },
      props.vatRates
    );
    const first = schedule.ok ? schedule.invoices[0] : undefined;
    if (!schedule.ok || !first) return [];
    const highest = Math.max(...schedule.invoices.map((i) => i.grossCents));
    return [{ termMonths, quote, first, highest, totals: schedule.totals }];
  });
  if (rows.length < 2) return null;

  return (
    <section aria-labelledby="compare-terms">
      <h2 id="compare-terms" className="font-display text-base font-bold tracking-tight uppercase">
        {t('lease.compare')}
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs tracking-wide text-muted uppercase">
            <tr className="border-b border-line">
              <th className="py-2 pr-4 font-semibold">{t('lease.term')}</th>
              <th className="py-2 pr-4 text-right font-semibold">{t('lease.net')}</th>
              <th className="py-2 pr-4 text-right font-semibold">{t('lease.compareMonthly')}</th>
              <th className="py-2 text-right font-semibold">{t('lease.totalGross')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.termMonths}
                aria-current={row.termMonths === props.selectedTerm ? 'true' : undefined}
                className="border-b border-line last:border-b-0 aria-[current]:font-semibold"
              >
                <td className="py-2 pr-4">{t('lease.months', { count: row.termMonths })}</td>
                <td className="py-2 pr-4 text-right">{euro(row.quote.monthlyNetRentCents)}</td>
                <td className="py-2 pr-4 text-right whitespace-nowrap">
                  {row.highest === row.first.grossCents
                    ? euro(row.first.grossCents)
                    : `${euro(row.first.grossCents)} → ${euro(row.highest)}`}
                </td>
                <td className="py-2 text-right">{euro(row.totals.grossCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">{t('lease.compareNote')}</p>
    </section>
  );
}
