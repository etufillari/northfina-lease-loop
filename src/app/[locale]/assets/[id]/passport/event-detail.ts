// One passport timeline row: a translated label and a one-line detail for each AssetEvent
// type. Details are stored JSON written by different parts of the app, so every field is
// read defensively; an unknown type still shows, by name.
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { PassportEvent } from '@/server/passport';

const num = (value: unknown) => (typeof value === 'number' ? value : null);
const str = (value: unknown) => (typeof value === 'string' ? value : null);

export function eventLabel(locale: Locale, type: string): string {
  const t = getT(locale);
  const key = `passport.event.${type}`;
  return key in messages[locale] ? t(key as MessageKey) : t('passport.event.other', { type });
}

export function eventDetail(locale: Locale, event: PassportEvent): string | null {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const condition = (c: string) =>
    `condition.${c}` in messages[locale] ? t(`condition.${c}` as MessageKey) : c;
  const d = event.details;

  switch (event.type) {
    case 'leased': {
      const rent = num(d.monthlyNetRentCents);
      const term = num(d.termMonths);
      return rent !== null && term !== null
        ? t('passport.detail.lease', { rent: euro(rent), term })
        : null;
    }
    case 'returned':
    case 'bought': {
      const used = num(d.usedMonths);
      if (d.reason === 'early_exit' && used !== null) {
        return t('passport.detail.earlyExit', { months: used });
      }
      return d.reason === 'end_of_term' ? t('passport.detail.endOfTerm') : null;
    }
    case 'refurbished': {
      const items = Array.isArray(d.items) ? d.items : [];
      const names = items
        .map((item) => str((item as { id?: unknown }).id))
        .filter((id): id is string => id !== null)
        .map((id) =>
          `secondLife.item.${id}` in messages[locale]
            ? t(`secondLife.item.${id}` as MessageKey)
            : id
        );
      const parts = [names.join(', ')];
      const total = num(d.totalCents);
      if (total !== null) parts[0] = `${parts[0]}: ${euro(total)}`;
      const before = num(d.usageBefore);
      if (d.usageReset === true && before !== null) {
        parts.push(t('passport.detail.usageReset', { usage: formatNumber(before, locale) }));
      }
      const life = num(d.life);
      const kg = num(d.co2AvoidedKg);
      if (life !== null && kg !== null) {
        parts.push(t('passport.detail.lifeCo2', { life, kg: formatNumber(kg, locale) }));
      }
      return parts.join(' · ');
    }
    case 'upgraded': {
      const from = str(d.from);
      const to = str(d.to);
      const cost = num(d.costCents);
      return from && to && cost !== null
        ? t('passport.detail.upgrade', {
            from: condition(from),
            to: condition(to),
            cost: euro(cost),
          })
        : null;
    }
    case 'offered_to_waiter': {
      const who = str(d.who) ?? str(d.waiterId) ?? '';
      const rent = num(d.monthlyNetRentCents);
      const until = str(d.until);
      if (!until || rent === null) return null;
      const values = { who, rent: euro(rent), until: formatIsoDate(until, locale) };
      const setSize = num(d.setSize);
      return setSize !== null && setSize > 1
        ? t('passport.detail.offerSet', { ...values, count: setSize })
        : t('passport.detail.offer', values);
    }
    case 'pooled_for_waiter': {
      const filled = num(d.filled);
      const quantity = num(d.quantity);
      const until = str(d.until);
      return filled !== null && quantity !== null && until
        ? t('passport.detail.pooled', {
            who: str(d.who) ?? str(d.waiterId) ?? '',
            filled,
            quantity,
            until: formatIsoDate(until, locale),
          })
        : null;
    }
    case 'pool_released': {
      const filled = num(d.filled);
      const quantity = num(d.quantity);
      return filled !== null && quantity !== null
        ? t('passport.detail.released', { filled, quantity })
        : null;
    }
    default:
      return null;
  }
}
