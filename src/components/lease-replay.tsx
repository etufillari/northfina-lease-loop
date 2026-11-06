'use client';

// Replay the lease month by month (the Wildcard, D-048): a slider over the invoiced months shows
// what has been billed by then, the VAT in force, what leaving early would cost and when the
// end-of-term choice opens. Read-only: it changes no data and not the demo date.
import { useId, useState } from 'react';
import type { VatRates } from '@/data/schemas';
import { exitMonthOn, type ExitContext, type ExitContract } from '@/domain/early-exit';
import { endOfTermDates } from '@/domain/end-of-term';
import { vatSteps, type Invoice } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { replayMonth, replayMonthCount, type ReplayInput } from '@/domain/replay';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type LeaseReplayProps = {
  locale: Locale;
  contract: ExitContract;
  /** The invoices the lease issues: all of them, or those before an ending. */
  schedule: { downPayment: Invoice | null; invoices: Invoice[] };
  vatRates: VatRates;
  /** Null when leaving early can't be priced, e.g. once the lease has ended. */
  exitContext: ExitContext | null;
  /** The day the lease ended, or null while it runs. */
  endedOn: string | null;
  today: string;
};

export function LeaseReplay(props: LeaseReplayProps) {
  const { locale, contract, schedule } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const rate = (percent: number) => formatNumber(percent, locale);
  const sliderId = useId();

  const input: ReplayInput = {
    schedule,
    termMonths: contract.termMonths,
    earlyExit: props.exitContext ? { contract, context: props.exitContext } : null,
  };
  const count = replayMonthCount(input);
  const todayMonth = monthOfToday(contract, props.today, count);
  const [month, setMonth] = useState(todayMonth ?? 1);
  if (count === 0) return null;
  const shown = Math.min(month, count);
  const m = replayMonth(input, shown);
  const steps = vatSteps(schedule, props.vatRates);
  const step = m.vatChanged
    ? steps.find((s) => s.firstInvoiceDate === m.invoice.invoiceDate)
    : null;
  const opensOn = endOfTermDates(contract).opensOn;
  const label = t('replay.monthValue', {
    month: shown,
    term: count,
    date: date(m.invoice.invoiceDate),
  });

  return (
    <div className="panel mt-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <label htmlFor={sliderId} className="eyebrow">
          {t('replay.month')}
        </label>
        {todayMonth !== null && shown !== todayMonth ? (
          <button type="button" className="btn-ghost text-sm" onClick={() => setMonth(todayMonth)}>
            {t('replay.backToToday')}
          </button>
        ) : null}
      </div>
      <input
        id={sliderId}
        type="range"
        min={1}
        max={count}
        value={shown}
        onChange={(e) => setMonth(Number(e.target.value))}
        className="range mt-2 w-full"
        style={{ '--fill': `${fillPercent(shown, count)}%` } as React.CSSProperties}
        aria-valuetext={label}
      />
      <Timeline
        invoices={schedule.invoices}
        shown={shown}
        todayMonth={todayMonth}
        rate={rate}
        t={t}
      />

      <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
        {label}
        {shown === todayMonth ? (
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent-text ring-1 ring-accent/40 ring-inset">
            {t('replay.today')}
          </span>
        ) : null}
      </p>

      {step ? (
        <p className="mt-3 rounded-md bg-warn-bg p-3 text-sm text-warn-fg ring-1 ring-warn-line ring-inset">
          {t('replay.vatStep', {
            from: rate(m.previousVatRatePercent ?? m.vatRatePercent),
            to: rate(m.vatRatePercent),
            date: date(step.validFrom),
            net: euro(m.invoice.netCents),
            gross: euro(m.invoice.grossCents),
          })}
        </p>
      ) : null}

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="eyebrow">{t('replay.thisInvoice')}</p>
          <p className="mt-1 font-display text-3xl font-extrabold tracking-tight tabular-nums">
            {euro(m.invoice.grossCents)}
          </p>
          <p className="text-sm text-muted">
            {t('replay.invoiceLine', {
              date: date(m.invoice.invoiceDate),
              rate: rate(m.vatRatePercent),
            })}
          </p>
        </div>
        <div>
          <p className="eyebrow">{t('replay.invoicedSoFar')}</p>
          <p className="mt-1 font-display text-3xl font-extrabold tracking-tight text-accent-text tabular-nums">
            {euro(m.totals.grossCents)}
          </p>
          <dl className="mt-1 text-sm">
            <Line label={t('replay.invoiceCount')}>{m.issuedCount}</Line>
            <Line label={t('contract.net')}>{euro(m.totals.netCents)}</Line>
            <Line label={t('contract.vat')}>{euro(m.totals.vatCents)}</Line>
          </dl>
        </div>
      </div>

      <div className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
        {m.earlyExit && !m.endOfTermOpen ? (
          <div>
            <p className="eyebrow">{t('replay.leaveEarly')}</p>
            <dl className="mt-1">
              <Line label={t('early.kind.early_buy')}>{euro(m.earlyExit.buyGrossCents)}</Line>
              <Line label={t('early.kind.early_hand_back')}>
                {euro(m.earlyExit.handBackGrossCents)}
              </Line>
            </dl>
            <p className="mt-1 text-muted">
              {t('replay.effective', { date: date(m.earlyExit.effectiveDate) })}
            </p>
          </div>
        ) : null}
        <div>
          <p className="eyebrow">{t('end.title')}</p>
          <p className="mt-1">
            {props.endedOn
              ? t('replay.ended', { date: date(props.endedOn) })
              : m.endOfTermOpen
                ? t('replay.endOpen')
                : t('end.notYet', { date: date(opensOn) })}
          </p>
        </div>
      </div>
    </div>
  );
}

/** One bar per month, filled up to the shown month, with the VAT rate in force beneath. */
function Timeline(props: {
  invoices: Invoice[];
  shown: number;
  todayMonth: number | null;
  rate: (percent: number) => string;
  t: ReturnType<typeof getT>;
}) {
  const bands = rateBands(props.invoices);
  // The first rate is neutral; every later one is marked like the VAT note in the invoices.
  const tone = (i: number) => (i === 0 ? 'bg-muted/50' : 'bg-warn-line');
  return (
    <div aria-hidden="true" className="mt-1">
      <div className="flex h-5 items-center gap-px">
        {props.invoices.map((invoice) => (
          <span
            key={invoice.number}
            className={`flex-1 rounded-[2px] transition-[height,background-color] ${invoice.number === props.shown ? 'h-5 bg-accent' : invoice.number < props.shown ? 'h-3 bg-accent/60' : 'h-3 bg-surface-2'}`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-px">
        {bands.map((band, i) => (
          <span
            key={band.firstMonth}
            style={{ flexGrow: band.months, flexBasis: 0 }}
            className={`h-1 rounded-full ${tone(i)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex h-2 gap-px">
        {props.invoices.map((invoice) => (
          <span key={invoice.number} className="flex flex-1 justify-center">
            {invoice.number === props.todayMonth ? (
              <span className="size-1.5 rounded-full bg-fg" />
            ) : null}
          </span>
        ))}
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        {bands.map((band, i) => (
          <li key={band.firstMonth} className="flex items-center gap-1.5">
            <span className={`h-1 w-4 rounded-full ${tone(i)}`} />
            <span className={i > 0 ? 'font-semibold text-fg' : ''}>
              {props.t('replay.rateBand', {
                rate: props.rate(band.ratePercent),
                month: band.firstMonth,
              })}
            </span>
          </li>
        ))}
        {props.todayMonth !== null ? (
          <li className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-fg" />
            {props.t('replay.today')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Runs of consecutive months billed at the same VAT rate. */
function rateBands(invoices: Invoice[]) {
  const bands: { firstMonth: number; months: number; ratePercent: number }[] = [];
  for (const invoice of invoices) {
    const last = bands.at(-1);
    if (last && last.ratePercent === invoice.vatRatePercent) last.months++;
    else bands.push({ firstMonth: invoice.number, months: 1, ratePercent: invoice.vatRatePercent });
  }
  return bands;
}

/** Today's invoice month, if today falls within the months there are to replay. */
function monthOfToday(contract: ExitContract, today: string, count: number): number | null {
  const current = exitMonthOn(contract, today);
  return current.ok && current.month <= count ? current.month : null;
}

function fillPercent(month: number, count: number): number {
  return count <= 1 ? 100 : ((month - 1) / (count - 1)) * 100;
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
