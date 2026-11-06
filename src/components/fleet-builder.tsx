'use client';
// Pick distinct items of one category; the shared configurator prices the group as one
// banded contract. Picking the first item greys out the other categories.
import { useState } from 'react';
import { formatEuro } from '@/domain/money';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { PriceConfigurator } from './price-configurator';

type FleetAsset = {
  id: string;
  category: string;
  make: string;
  model: string;
  condition: string;
  priceCents: number | null;
};

export function FleetBuilder({
  locale,
  assets,
  personaId,
  asOf,
}: {
  locale: Locale;
  assets: FleetAsset[];
  personaId: string | null;
  asOf: string | null;
}) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [selected, setSelected] = useState<string[]>([]);
  const activeCategory = assets.find((a) => a.id === selected[0])?.category ?? null;

  function toggle(asset: FleetAsset) {
    setSelected((current) =>
      current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id]
    );
  }

  const categories = [...new Set(assets.map((a) => a.category))];

  return (
    <div className="mt-6">
      {categories.map((category) => (
        <section key={category} className="mt-4">
          <h2 className="text-sm font-semibold text-stone-600 dark:text-stone-400">
            {t(`category.${category}` as MessageKey)}
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {assets
              .filter((asset) => asset.category === category)
              .map((asset) => {
                const disabled = activeCategory !== null && activeCategory !== category;
                const checked = selected.includes(asset.id);
                return (
                  <li key={asset.id}>
                    <label
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                        checked
                          ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950'
                          : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900'
                      } ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(asset)}
                          className="accent-emerald-700"
                        />
                        <span>
                          <span className="font-medium">
                            {asset.make} {asset.model}
                          </span>{' '}
                          <span className="text-stone-500">
                            · {t(`condition.${asset.condition}` as MessageKey)}
                          </span>
                        </span>
                      </span>
                      <span className="tabular-nums">{euro(asset.priceCents ?? 0)}</span>
                    </label>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {selected.length > 0 ? (
        <>
          <p className="mt-6 text-sm font-medium">
            {t('fleet.selected', { count: selected.length })}
          </p>
          <PriceConfigurator
            locale={locale}
            assetIds={selected}
            personaId={personaId}
            asOf={asOf}
          />
        </>
      ) : null}
    </div>
  );
}
