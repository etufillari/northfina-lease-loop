'use client';
// The meter reading for each item being handed back (end of term or early exit): the lifetime
// figure on the odometer, battery report or hour meter. It cannot be below what the item had
// already done; the server checks the same rule (src/domain/usage.ts).
import { formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export type ReturnItem = { id: string; name: string; unit: string; total: number };

/** Asset id → the typed reading as a whole number, or null while any is missing or too low. */
export function parsedReadings(
  items: readonly ReturnItem[],
  typed: Record<string, string>
): Record<string, number> | null {
  const readings: Record<string, number> = {};
  for (const item of items) {
    const raw = (typed[item.id] ?? '').replace(/\s/g, '');
    if (!/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    if (value < item.total) return null;
    readings[item.id] = value;
  }
  return readings;
}

export function UsageReadingFields({
  locale,
  items,
  typed,
  onChange,
}: {
  locale: Locale;
  items: readonly ReturnItem[];
  typed: Record<string, string>;
  onChange: (assetId: string, value: string) => void;
}) {
  const t = getT(locale);
  return (
    <fieldset className="mt-3 text-sm">
      <legend className="font-medium">{t('usage.readingTitle')}</legend>
      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">{t('usage.readingHelp')}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const raw = (typed[item.id] ?? '').replace(/\s/g, '');
          const tooLow = /^\d+$/.test(raw) && Number(raw) < item.total;
          return (
            <label key={item.id} className="block">
              <span className="text-stone-700 dark:text-stone-300">
                {item.name} ({t(`usage.unit.${item.unit}` as MessageKey)})
              </span>
              <input
                inputMode="numeric"
                value={typed[item.id] ?? ''}
                onChange={(event) => onChange(item.id, event.target.value)}
                placeholder={String(item.total)}
                aria-invalid={tooLow}
                className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 tabular-nums dark:border-stone-700 dark:bg-stone-900"
              />
              <span
                className={`mt-1 block text-xs ${tooLow ? 'text-red-700 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}`}
              >
                {t('usage.readingAtLeast', { value: formatNumber(item.total, locale) })}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
