'use client';

import type { Dispatch, SetStateAction } from 'react';
import {
  damageLiabilities,
  damageTypes,
  type DamageLiability,
  type DamageType,
} from '@/domain/inspection';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { inputClass } from './form-classes';

export type DamageState = {
  area: string;
  type: DamageType;
  liability: DamageLiability;
  repair: string;
};

/** Damage found at inspection, each with who answers for it. */
export function DamageLog({
  locale,
  damage,
  setDamage,
  priceAgreed,
}: {
  locale: Locale;
  damage: DamageState[];
  setDamage: Dispatch<SetStateAction<DamageState[]>>;
  /** The customer's price is already fixed, so who answers for the damage changes nothing. */
  priceAgreed: boolean;
}) {
  const t = getT(locale);
  const setDamageRow = (index: number, change: Partial<DamageState>) =>
    setDamage((current) =>
      current.map((entry, position) => (position === index ? { ...entry, ...change } : entry))
    );
  return (
    <section>
      <h3 className="text-caption font-semibold">{t('inspection.section.damage')}</h3>
      <p className="mt-1 text-caption text-ink-muted">
        {t(priceAgreed ? 'inspection.damageHintAgreed' : 'inspection.damageHint')}
      </p>
      <ul className="mt-3 space-y-4">
        {damage.map((entry, index) => (
          <li key={index} className="rounded-sm bg-parchment p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-caption sm:col-span-2">
                {t('inspection.damageArea')}
                <input
                  required
                  maxLength={80}
                  value={entry.area}
                  onChange={(event) => setDamageRow(index, { area: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-caption">
                {t('inspection.damageType')}
                <select
                  value={entry.type}
                  onChange={(event) =>
                    setDamageRow(index, { type: event.target.value as DamageType })
                  }
                  className={inputClass}
                >
                  {damageTypes.map((type) => (
                    <option key={type} value={type}>
                      {t(`inspection.damage.${type}`)}
                    </option>
                  ))}
                </select>
              </label>
              {priceAgreed ? null : (
                <label className="text-caption">
                  {t('inspection.damageLiability')}
                  <select
                    value={entry.liability}
                    onChange={(event) =>
                      setDamageRow(index, { liability: event.target.value as DamageLiability })
                    }
                    className={inputClass}
                  >
                    {damageLiabilities.map((liability) => (
                      <option key={liability} value={liability}>
                        {t(`inspection.liability.${liability}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-caption">
                {t('inspection.repairCost')}
                <input
                  inputMode="decimal"
                  value={entry.repair}
                  onChange={(event) => setDamageRow(index, { repair: event.target.value })}
                  className={inputClass}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() =>
                    setDamage((current) => current.filter((_, position) => position !== index))
                  }
                  className="min-h-target text-caption text-primary underline"
                >
                  {t('inspection.damageRemove')}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {damage.length < 12 ? (
        <button
          type="button"
          onClick={() =>
            setDamage((current) => [
              ...current,
              { area: '', type: 'scratch', liability: 'fair_wear', repair: '' },
            ])
          }
          className="mt-3 min-h-target rounded-pill border border-primary px-5 py-2 text-caption text-primary"
        >
          {t('inspection.damageAdd')}
        </button>
      ) : null}
    </section>
  );
}
