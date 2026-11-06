import type { VatRate } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { vatChange } from '@/domain/vat-change';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type Payment = Parameters<typeof vatChange>[1];

/** Card 3: under a payment whose VAT rate differs from the one before, say exactly what changed. */
export function VatChangeNote({
  previous,
  payment,
  rates,
  locale,
}: {
  previous: Payment | undefined;
  payment: Payment;
  rates: readonly VatRate[];
  locale: Locale;
}) {
  const change = vatChange(previous, payment, rates);
  if (!change) return null;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const to = formatNumber(change.toBasisPoints / 100, locale);
  return (
    <p className="mt-2 rounded-sm bg-parchment px-3 py-2 text-fine">
      {t('vatChange.note', {
        from: formatNumber(change.fromBasisPoints / 100, locale),
        to,
        difference: `${change.differenceCents >= 0 ? '+' : '−'}${euro(Math.abs(change.differenceCents))}`,
        net: euro(change.netCents),
      })}
      {change.fictional ? ` ${t('vatChange.fictional', { to })}` : null}
    </p>
  );
}
