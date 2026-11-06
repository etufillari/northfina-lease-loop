import type { CoefficientTable } from '@/data/schemas';
import type { PriceTerms } from '@/domain/pricing';
import { downPaymentBandReference } from '@/domain/price-comparison';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export function PriceBandNotice({
  terms,
  table,
  locale,
}: {
  terms: PriceTerms;
  table: CoefficientTable;
  locale: Locale;
}) {
  const reference = downPaymentBandReference(terms, table);
  if (!reference) return null;
  const t = getT(locale);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const factor = (millionths: number) =>
    new Intl.NumberFormat(intlLocale[locale], {
      maximumFractionDigits: 6,
    }).format(millionths / 1_000_000);
  const { referenceTerms: before, monthlyNetDifferenceCents: difference } = reference;
  const change =
    difference > 0
      ? 'explain.bandHigher'
      : difference < 0
        ? 'explain.bandLower'
        : 'explain.bandSameAmount';
  return (
    <aside className="mt-3 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <p className="font-medium">{t('explain.bandReference')}</p>
      <p>
        {t('explain.bandChanged', {
          fromBand: before.band,
          toBand: terms.band,
          fromAmount: money(before.financedCents),
          toAmount: money(terms.financedCents),
          fromFactor: factor(before.factorMillionths),
          toFactor: factor(terms.factorMillionths),
        })}
      </p>
      <p className="font-semibold">{t(change, { amount: money(Math.abs(difference)) })}</p>
    </aside>
  );
}
