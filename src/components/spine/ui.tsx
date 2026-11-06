import type { ReactNode } from 'react';
import type { PriceTerms } from '@/domain/pricing';
import { formatEuro } from '@/domain/money';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export const panelClass = 'ui-panel';
export const inputClass = 'ui-input';
export const buttonClass = 'ui-button';
export const secondaryButtonClass = 'ui-button ui-button--secondary';

export function messageFor(
  locale: Locale,
  key: string,
  fallback: MessageKey = 'spine.error'
): string {
  return getT(locale)(key in messages[locale] ? (key as MessageKey) : fallback);
}

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

export function MoneyFacts({ terms, locale }: { terms: PriceTerms; locale: Locale }) {
  const t = getT(locale);
  const values: [MessageKey, number][] = [
    ['spine.list', terms.listPriceCents],
    ['spine.down', terms.downPaymentCents],
    ['spine.financed', terms.financedCents],
    ['spine.monthlyNet', terms.monthlyNetCents],
    ['spine.rentTotal', terms.totalRentNetCents],
    ['spine.buyout', terms.buyoutNetCents],
    ['spine.useTotal', terms.downPaymentCents + terms.totalRentNetCents],
    ['spine.ownTotal', terms.downPaymentCents + terms.totalRentNetCents + terms.buyoutNetCents],
  ];
  return (
    <dl className="divide-y divide-stone-200 dark:divide-stone-700">
      {values.map(([key, amount]) => (
        <div key={key} className="price-row">
          <dt>{t(key)}</dt>
          <dd>{formatEuro(amount, intlLocale[locale])}</dd>
        </div>
      ))}
    </dl>
  );
}
