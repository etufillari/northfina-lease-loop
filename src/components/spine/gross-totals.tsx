import type { VatRates } from '@/data/schemas';
import type { PriceTerms } from '@/domain/pricing';
import { leaseTotals, type IssuedAmount } from '@/domain/totals';
import { isIsoDate } from '@/domain/calendar';
import { canScheduleLease } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export function GrossTotals({
  terms,
  startDate,
  upfrontDate,
  vatRates,
  issued,
  locale,
}: {
  terms: PriceTerms;
  startDate: string;
  upfrontDate: string;
  vatRates: VatRates;
  issued?: readonly IssuedAmount[];
  locale: Locale;
}) {
  const t = getT(locale);
  if (!isIsoDate(upfrontDate) || !canScheduleLease(startDate, terms.termMonths))
    return (
      <p className="mt-4" role="status">
        {t('spine.invalidTerms')}
      </p>
    );
  const totals = leaseTotals({ terms, startDate, upfrontDate, vatRates, issued });
  if (!totals.ok)
    return (
      <p className="mt-4" role="status">
        {t('spine.error')}
      </p>
    );
  const rows: [MessageKey, number][] = [
    ['spine.forecastRentGross', totals.rentGrossCents],
    ['spine.forecastUseGross', totals.useGrossCents],
    ['spine.forecastOwnGross', totals.ownGrossCents],
  ];
  if (issued) rows.push(['spine.issuedTotal', totals.issuedGrossCents]);
  return (
    <div className="mt-5 space-y-3 rounded-xl bg-emerald-50 p-4 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
      <dl className="space-y-3">
        {rows.map(([key, cents]) => (
          <div key={key} className="flex flex-wrap justify-between gap-2">
            <dt>{t(key)}</dt>
            <dd className="font-semibold tabular-nums">{formatEuro(cents, intlLocale[locale])}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">{t('spine.forecastTotalHelp')}</p>
    </div>
  );
}
