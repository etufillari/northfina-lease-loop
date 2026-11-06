import { findPriceGuardianSuggestion, type PriceGuardianInput } from '@/domain/price-guardian';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { buttonClass } from './ui';

export function PriceGuardian({
  input,
  locale,
  busy,
  onChoose,
}: {
  input: PriceGuardianInput | null;
  locale: Locale;
  busy: boolean;
  onChoose: (downPaymentCents: number) => void;
}) {
  const suggestion = input ? findPriceGuardianSuggestion(input) : null;
  if (!suggestion) return null;
  const { current, alternative, savings } = suggestion;
  const t = getT(locale);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const factor = (millionths: number) =>
    new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 6 }).format(
      millionths / 1_000_000
    );
  const firstDate = formatIsoDate(current.firstRent.invoiceDate, locale);
  const rows = [
    [t('guardian.downNet'), current.terms.downPaymentCents, alternative.terms.downPaymentCents],
    [t('guardian.downGross'), current.upfront.grossCents, alternative.upfront.grossCents],
    [t('guardian.monthlyNet'), current.terms.monthlyNetCents, alternative.terms.monthlyNetCents],
    [
      t('guardian.firstGross', { date: firstDate }),
      current.firstRent.grossCents,
      alternative.firstRent.grossCents,
    ],
    [t('guardian.useGross'), current.useGrossCents, alternative.useGrossCents],
    [t('guardian.buyoutGross'), current.buyout.grossCents, alternative.buyout.grossCents],
    [t('guardian.ownGross'), current.ownGrossCents, alternative.ownGrossCents],
  ] as const;
  const buyoutIncrease = alternative.buyout.grossCents - current.buyout.grossCents;

  return (
    <section
      id="price-guardian"
      aria-labelledby="guardian-heading"
      className="price-guardian mt-6 space-y-4 rounded-xl border p-4"
    >
      <h3 id="guardian-heading" className="text-lg font-semibold">
        {t('guardian.title')}
      </h3>
      <p role="status" aria-live="polite" aria-atomic="true" className="font-semibold">
        {t('guardian.summary', {
          useSaving: money(savings.useGrossCents),
          ownSaving: money(savings.ownGrossCents),
        })}
      </p>
      <p className="text-sm">
        {t('guardian.context', { months: current.terms.termMonths, date: firstDate })}
      </p>
      <p className="text-sm">
        {t('guardian.reason', {
          fromBand: current.terms.band,
          toBand: alternative.terms.band,
          fromFactor: factor(current.terms.factorMillionths),
          toFactor: factor(alternative.terms.factorMillionths),
        })}
      </p>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label={t('guardian.comparison')}
        tabIndex={0}
      >
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('guardian.comparison')}</caption>
          <thead>
            <tr>
              {[t('guardian.payment'), t('guardian.current'), t('guardian.suggested')].map(
                (label) => (
                  <th key={label} scope="col" className="p-2 align-bottom">
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, before, after]) => (
              <tr key={label}>
                <th scope="row" className="border-t p-2 font-medium">
                  {label}
                </th>
                <td className="border-t p-2 tabular-nums">{money(before)}</td>
                <td className="border-t p-2 font-semibold tabular-nums">{money(after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {buyoutIncrease > 0 ? (
        <p className="text-sm font-medium">
          {t('guardian.buyoutWarning', { amount: money(buyoutIncrease) })}
        </p>
      ) : null}
      <p className="text-sm">{t('guardian.taxNote')}</p>
      <p className="text-sm">{t('guardian.scope')}</p>
      <button
        id="guardian-choose"
        type="button"
        className={buttonClass}
        disabled={busy}
        aria-describedby="guardian-action-help"
        onClick={() => {
          if (!busy) onChoose(alternative.terms.downPaymentCents);
        }}
      >
        {t('guardian.choose', { amount: money(alternative.terms.downPaymentCents) })}
      </button>
      <p id="guardian-action-help" className="text-sm">
        {t('guardian.actionHelp')}
      </p>
    </section>
  );
}
