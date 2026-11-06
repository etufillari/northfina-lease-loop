import { invoiceAmounts } from '@/domain/lease-billing';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { RecoveryCalculation } from '@/server/recovery-input';

export type ReturnBreakdownData = {
  showEarly: boolean;
  earlyCents: number;
  repairSharePercent: number;
  repairCents: number;
  lines: readonly { key: string; label: string; cents: number }[];
  unpaidCents: number;
};

export function repairLineLabel(id: string): MessageKey {
  if (id === 'battery_weak') return 'return.issue.battery_weak';
  if (id === 'cosmetic') return 'flow.step.cosmetic';
  if (id === 'power') return 'flow.step.power';
  return `flow.check.${id}` as MessageKey;
}

/** The same lines the customer saw in the return form, from the quote saved for them. */
export function quoteBreakdown(locale: Locale, quote: RecoveryCalculation): ReturnBreakdownData {
  const t = getT(locale);
  const gross = (net: number) => invoiceAmounts(net, quote.vatBasisPoints).totalCents;
  const { settlement } = quote;
  const earlyCents = gross(settlement.earlyReturnNetCents);
  return {
    showEarly: settlement.remainingRentNetCents > 0,
    earlyCents,
    repairSharePercent: Math.round(settlement.repairShareBasisPoints / 100),
    // Taken from the total so the lines shown always add up to what is charged.
    repairCents: gross(settlement.returnNetCents) - earlyCents,
    lines: quote.agreedLines
      ? quote.agreedLines.map((line) => ({
          key: line.id,
          label: t(repairLineLabel(line.id)),
          cents: gross(line.netCents),
        }))
      : quote.chargeableDamage.map((item) => ({
          key: item.checkId ?? item.area,
          label: item.checkId
            ? t(`inspection.check.${item.checkId}` as MessageKey)
            : `${item.area} · ${t(`inspection.damage.${item.type}` as MessageKey)}`,
          cents: gross(item.netCents),
        })),
    unpaidCents: quote.outstandingInvoiceCents + quote.accruedUnissuedCents,
  };
}

/** What a return costs, line by line, with the same layout wherever the customer sees it. */
export function ReturnBreakdown({
  locale,
  data,
  currency,
}: {
  locale: Locale;
  data: ReturnBreakdownData;
  currency: (cents: number) => string;
}) {
  const t = getT(locale);
  return (
    <dl className="mt-4 divide-y divide-hairline text-caption tabular-nums">
      {data.showEarly ? (
        <div className="py-3">
          <div className="flex justify-between gap-4">
            <dt className="font-semibold">{t('flow.endingEarly')}</dt>
            <dd className="shrink-0 font-semibold">{currency(data.earlyCents)}</dd>
          </div>
        </div>
      ) : null}
      {data.repairCents > 0 || data.lines.length ? (
        <div className="py-3">
          <div className="flex justify-between gap-4">
            <dt className="font-semibold">
              {t('flow.yourRepairShare', { percent: data.repairSharePercent })}
            </dt>
            <dd className="shrink-0 font-semibold">{currency(data.repairCents)}</dd>
          </div>
          <ul className="mt-2 space-y-1 text-ink-muted">
            {data.lines.map((line) => (
              <li key={line.key} className="flex justify-between gap-4">
                <span>{line.label}</span>
                <span className="shrink-0">{currency(line.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.unpaidCents > 0 ? (
        <div className="flex justify-between gap-4 py-3">
          <dt className="font-semibold">{t('flow.unpaidRent')}</dt>
          <dd className="shrink-0 font-semibold">{currency(data.unpaidCents)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
