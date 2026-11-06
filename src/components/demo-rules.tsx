// The rules the app applies on the demo date (D-058), read from the data pack and pricing-rules.ts.
import type { RulesInForce } from '@/domain/rules-in-force';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export function DemoRules({ rules, locale }: { rules: RulesInForce; locale: Locale }) {
  const t = getT(locale);
  const rows: [string, string][] = [
    [
      t('demo.rules.priceList'),
      rules.priceListVersion === null
        ? '–'
        : t('demo.rules.priceListValue', { version: rules.priceListVersion }),
    ],
    [
      t('demo.rules.vat'),
      [
        rules.vatRatePercent === null ? '–' : `${formatNumber(rules.vatRatePercent, locale)} %`,
        rules.nextVat
          ? t('demo.rules.nextVat', {
              date: formatIsoDate(rules.nextVat.from, locale),
              rate: formatNumber(rules.nextVat.ratePercent, locale),
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    [t('demo.rules.quote'), t('demo.rules.quoteValue', { days: rules.quoteValidDays })],
    [
      t('demo.rules.affordability'),
      t('demo.rules.affordabilityValue', { percent: rules.affordabilityPercent }),
    ],
    [t('demo.rules.downStep'), formatEuro(rules.downPaymentStepCents, intlLocale[locale])],
    [t('demo.rules.billing'), t('demo.rules.billingValue')],
    [t('demo.rules.manualReview'), t('demo.rules.manualReviewValue')],
  ];
  return (
    <dl className="panel grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
