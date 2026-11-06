'use client';

import Link from 'next/link';
import { useState } from 'react';
import { metricCategories, type CompanyMetrics } from '@/domain/company-metrics';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { LineChart, type ChartSeries } from './line-chart';

type Attention = { toAssess: number; toReceive: number; toRelist: number };
type ViewId = 'revenue' | 'leases' | 'leasesByCategory' | 'revenueByCategory';

const categoryColors = {
  e_bike: 'var(--color-chart-1)',
  laptop: 'var(--color-chart-2)',
  farm_machine: 'var(--color-chart-3)',
} as const;

const views: readonly {
  id: ViewId;
  metric: 'revenueCents' | 'activeLeases';
  split: boolean;
}[] = [
  { id: 'revenue', metric: 'revenueCents', split: false },
  { id: 'leases', metric: 'activeLeases', split: false },
  { id: 'leasesByCategory', metric: 'activeLeases', split: true },
  { id: 'revenueByCategory', metric: 'revenueCents', split: true },
];

export function CompanyDashboard({
  locale,
  metrics,
  attention,
}: {
  locale: Locale;
  metrics: CompanyMetrics;
  attention: Attention;
}) {
  const t = getT(locale);
  const [viewId, setViewId] = useState<ViewId>('revenue');
  const view = views.find((item) => item.id === viewId)!;
  const intl = intlLocale[locale];
  const euros = (cents: number) =>
    new Intl.NumberFormat(intl, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  const count = (value: number) => new Intl.NumberFormat(intl).format(value);
  const monthName = (month: string) =>
    new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${month}-01T00:00:00Z`)
    );
  const { summary } = metrics;
  const change =
    summary.previousMonthRevenueCents > 0
      ? (summary.lastFullMonthRevenueCents - summary.previousMonthRevenueCents) /
        summary.previousMonthRevenueCents
      : null;
  const series: ChartSeries[] = view.split
    ? metricCategories.map((category) => ({
        id: category,
        label: t(`category.${category}`),
        color: categoryColors[category],
        values: metrics[view.metric][category],
      }))
    : [
        {
          id: 'total',
          label: t(`admin.view.${view.id}`),
          color: 'var(--color-chart-1)',
          values: metrics[view.metric].total,
        },
      ];
  const waiting = [
    { key: 'toAssess', value: attention.toAssess, anchor: 'assess' },
    { key: 'toReceive', value: attention.toReceive, anchor: 'progress' },
    { key: 'toRelist', value: attention.toRelist, anchor: 'relist' },
  ] as const;
  const hasWaiting = waiting.some((item) => item.value > 0);

  return (
    <>
      <section aria-labelledby="attention-title" className="mt-8 rounded-lg bg-parchment p-6">
        <h2 id="attention-title" className="text-tagline font-semibold">
          {t('admin.attention')}
        </h2>
        {hasWaiting ? (
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {waiting
              .filter((item) => item.value > 0)
              .map((item) => (
                <li key={item.key}>
                  <Link
                    href={`/${locale}/staff/returns#${item.anchor}`}
                    className="inline-flex min-h-target items-center text-body text-primary"
                  >
                    {t(`admin.attention.${item.key}`, { count: item.value })}
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-3 text-body text-ink-muted">{t('admin.attention.none')}</p>
        )}
      </section>

      <dl className="mt-6 grid gap-5 grid:grid-cols-3">
        {summary.lastFullMonth ? (
          <Tile
            label={t('admin.tile.revenue', { month: monthName(summary.lastFullMonth) })}
            value={euros(summary.lastFullMonthRevenueCents)}
            detail={
              change === null
                ? null
                : t('admin.tile.change', {
                    change: new Intl.NumberFormat(intl, {
                      style: 'percent',
                      maximumFractionDigits: 0,
                      signDisplay: 'exceptZero',
                    }).format(change),
                  })
            }
          />
        ) : null}
        <Tile
          label={t('admin.tile.active')}
          value={count(summary.activeNow)}
          detail={t('admin.tile.new', { count: summary.newThisMonth })}
        />
        {summary.topCategory ? (
          <Tile
            label={t('admin.tile.top')}
            value={t(`category.${summary.topCategory}`)}
            detail={t('admin.tile.share', { share: summary.topCategorySharePercent })}
          />
        ) : null}
      </dl>

      <section aria-labelledby="chart-title" className="mt-8">
        <div role="group" aria-label={t('admin.chart.views')} className="flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === viewId}
              onClick={() => setViewId(item.id)}
              className={`pressable min-h-target rounded-pill px-4 py-2 text-caption ${item.id === viewId ? 'bg-primary font-semibold text-white' : 'bg-parchment text-ink hover:bg-divider'}`}
            >
              {t(`admin.view.${item.id}`)}
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-hairline p-4 sm:p-6">
          <h2 id="chart-title" className="text-tagline font-semibold">
            {t(`admin.chart.${view.id}`)}
          </h2>
          <p className="mt-2 max-w-2xl text-caption text-ink-muted">
            {t(
              view.metric === 'revenueCents' ? 'admin.chart.revenueNote' : 'admin.chart.leasesNote'
            )}
          </p>
          <LineChart
            key={view.id}
            locale={locale}
            title={t(`admin.chart.${view.id}`)}
            months={metrics.months}
            series={series}
            money={view.metric === 'revenueCents'}
            partialLastMonth={view.metric === 'revenueCents'}
          />
        </div>
      </section>
    </>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string | null }) {
  return (
    <div className="rounded-lg border border-hairline p-6">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="mt-2 font-display text-display-sm font-semibold">{value}</dd>
      {detail ? <dd className="mt-2 text-caption text-ink-muted">{detail}</dd> : null}
    </div>
  );
}
