'use client';
// Pick a category first (a fleet is one category: cross-leasing would make the category
// questions ambiguous), then distinct items of it; the shared configurator prices the group
// as one banded contract. Clicking an item's name opens its details without leaving the page.
import { useState } from 'react';
import { AssetImage } from '@/components/asset-card';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { PriceConfigurator } from './price-configurator';

type FleetAsset = {
  id: string;
  category: string;
  make: string;
  model: string;
  condition: string;
  modelYear: number;
  usageUnit: string;
  usageValue: number;
  previousLives: number;
  imageUrl: string | null;
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
  const categories = [...new Set(assets.map((a) => a.category))];
  const [category, setCategory] = useState(categories[0] ?? 'e_bike');
  const [selected, setSelected] = useState<string[]>([]);
  const [shown, setShown] = useState<FleetAsset | null>(null);

  function toggle(asset: FleetAsset) {
    setSelected((current) =>
      current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id]
    );
  }

  function pickCategory(next: string) {
    setCategory(next);
    setSelected([]);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('fleet.pickCategory')}>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => pickCategory(c)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-inset ${
              category === c
                ? 'bg-emerald-700 text-white ring-emerald-700'
                : 'ring-stone-300 hover:bg-emerald-50 dark:ring-stone-700 dark:hover:bg-stone-800'
            }`}
          >
            {t(`category.${c}` as MessageKey)}
          </button>
        ))}
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {assets
          .filter((asset) => asset.category === category)
          .map((asset) => {
            const checked = selected.includes(asset.id);
            return (
              <li key={asset.id}>
                <label
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                    checked
                      ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950'
                      : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(asset)}
                      className="accent-emerald-700"
                    />
                    <span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setShown(asset);
                        }}
                        className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-300"
                      >
                        {asset.make} {asset.model}
                      </button>{' '}
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

      {shown ? <AssetDialog locale={locale} asset={shown} onClose={() => setShown(null)} /> : null}
    </div>
  );
}

/** The quick look at one item: photo and basic facts, without leaving the fleet page. */
function AssetDialog({
  locale,
  asset,
  onClose,
}: {
  locale: Locale;
  asset: FleetAsset;
  onClose: () => void;
}) {
  const t = getT(locale);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${asset.make} ${asset.model}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-stone-900"
        onClick={(event) => event.stopPropagation()}
      >
        <AssetImage
          imageUrl={asset.imageUrl}
          category={asset.category}
          alt={`${asset.make} ${asset.model}`}
          className="aspect-[3/2] w-full object-cover"
        />
        <div className="p-5">
          <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
          <h3 className="text-xl font-semibold">{asset.model}</h3>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Fact
              label={t('condition.label')}
              value={t(`condition.${asset.condition}` as MessageKey)}
            />
            <Fact label={t('asset.modelYear')} value={String(asset.modelYear)} />
            <Fact
              label={t('asset.usage')}
              value={t(`usage.${asset.usageUnit}` as MessageKey, {
                value: formatNumber(asset.usageValue, locale),
              })}
            />
            <Fact
              label={t('asset.previousLives')}
              value={formatNumber(asset.previousLives, locale)}
            />
          </dl>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl px-4 py-2.5 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
