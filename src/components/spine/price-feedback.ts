import type { PriceOption } from '@/domain/price-comparison';
import { isIsoDate } from '@/domain/calendar';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { Bootstrap } from './price-panel';

type Failure = Extract<PriceOption, { ok: false }>['reason'] | 'invalid_money';

/** Present domain failures consistently beside the form and each comparison option. */
export function priceFailureMessage(reason: Failure, data: Bootstrap, locale: Locale): string {
  const t = getT(locale);
  if (reason === 'invalid_date' && !isIsoDate(data.businessDate)) {
    return t('explain.invalidBusinessDate');
  }
  const keys: Record<Failure, MessageKey> = {
    invalid_money: 'explain.invalidAmount',
    invalid_down_payment: 'explain.invalidDown',
    invalid_term: 'explain.unknownTerm',
    unknown_term: 'explain.unknownTerm',
    below_minimum: 'explain.belowMinimum',
    above_maximum: 'explain.aboveMaximum',
    invalid_date: 'explain.invalidStart',
    no_vat_rate: 'explain.noVat',
    table_not_yet_valid: 'explain.tableNotValid',
  };
  const bands = data.coefficientTable.bands;
  const maximum =
    reason === 'invalid_down_payment'
      ? (data.offer?.priceCents ?? 0)
      : Math.max(...bands.map((band) => band.max_financed_cents));
  const date =
    reason === 'table_not_yet_valid' ? data.coefficientTable.valid_from : data.businessDate;
  return t(keys[reason], {
    minimum: formatEuro(
      Math.min(...bands.map((band) => band.min_financed_cents)),
      intlLocale[locale]
    ),
    maximum: formatEuro(maximum, intlLocale[locale]),
    date: isIsoDate(date) ? formatIsoDate(date, locale) : date,
  });
}
