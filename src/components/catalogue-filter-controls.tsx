'use client';

import { useRouter } from 'next/navigation';
import type { AssetCategory, AssetCondition, AssetStatus } from '@/data/schemas';
import type { Locale } from '@/i18n/locales';

type FilterValues = {
  category?: AssetCategory;
  status?: AssetStatus;
  condition?: AssetCondition;
};

export function CatalogueFilterControls({
  locale,
  values,
  labels,
  options,
}: {
  locale: Locale;
  values: FilterValues;
  labels: {
    title: string;
    category: string;
    status: string;
    condition: string;
    all: string;
    reset: string;
  };
  options: {
    categories: { value: AssetCategory; label: string }[];
    statuses: { value: AssetStatus; label: string }[];
    conditions: { value: AssetCondition; label: string }[];
  };
}) {
  const router = useRouter();

  function updateFilter(name: keyof FilterValues, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(name, value);
    else params.delete(name);
    const query = params.toString();
    router.push(`/${locale}${query ? `?${query}` : ''}`, { scroll: false });
  }

  function resetFilters() {
    router.push(`/${locale}`, { scroll: false });
  }

  return (
    <section className="mt-8 rounded-t-2xl border border-b-0 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="sr-only">{labels.title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_9rem]">
        <FilterSelect
          id="category"
          label={labels.category}
          value={values.category}
          options={options.categories}
          allLabel={labels.all}
          onChange={(value) => updateFilter('category', value)}
        />
        <FilterSelect
          id="status"
          label={labels.status}
          value={values.status}
          options={options.statuses}
          allLabel={labels.all}
          onChange={(value) => updateFilter('status', value)}
        />
        <FilterSelect
          id="condition"
          label={labels.condition}
          value={values.condition}
          options={options.conditions}
          allLabel={labels.all}
          onChange={(value) => updateFilter('condition', value)}
        />
        <button
          type="button"
          onClick={resetFilters}
          className="w-full self-end rounded-lg bg-[#101d46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b2c61] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#101d46]"
        >
          {labels.reset}
        </button>
      </div>
    </section>
  );
}

function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-stone-700 dark:text-slate-200">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value ?? ''}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="ui-control mt-2 appearance-none pr-10 text-sm"
        >
          <option value="">{allLabel}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-[18px] size-4 -translate-y-1/2 text-stone-600 dark:text-slate-300"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </div>
    </div>
  );
}
