// The dealer's forecast: which leases end soon, so the dealer can prepare for the items that
// come back. Default view is next calendar month; the date filter changes the range.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ForecastFilter } from '@/components/dealer/forecast-filter';
import { ForecastSummaryCards } from '@/components/dealer/forecast-summary';
import { ForecastTable } from '@/components/dealer/forecast-table';
import { resolveForecastRange } from '@/domain/lease-forecast';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { db } from '@/server/db';
import { getLeaseForecast } from '@/server/lease-forecast';
import { todayIso } from '@/server/today';

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export default async function ForecastPage({
  params,
  searchParams,
}: PageProps<'/[locale]/dealer/forecast'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Today and the database change between visits, so render on every request.
  await connection();

  const t = getT(locale);
  const today = todayIso();
  const query = await searchParams;
  const from = first(query.from);
  const to = first(query.to);

  // A range typed into the URL may be wrong. Say why, and show next month instead.
  const requested = resolveForecastRange(today, { from, to });
  const usable = requested.ok;
  const notice = requested.ok ? null : t(`dealer.forecast.invalid.${requested.reason}`);

  const forecast = await getLeaseForecast(db, {
    today,
    ...(usable ? { from, to } : {}),
  });
  const { range } = forecast;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('dealer.forecast.title')}
      </h1>

      <ForecastFilter
        locale={locale}
        today={today}
        range={range}
        preset={forecast.preset}
        notice={notice}
        t={t}
      />
      <ForecastSummaryCards summary={forecast.summary} locale={locale} t={t} />
      <ForecastTable entries={forecast.entries} locale={locale} t={t} />
    </div>
  );
}
