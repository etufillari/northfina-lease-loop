'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { axisTicks } from '@/domain/company-metrics';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type ChartSeries = { id: string; label: string; color: string; values: number[] };

const margin = { top: 16, left: 64, bottom: 30 };
const narrowWidth = 560;
const labelGap = 18;

/**
 * Months on the x-axis and one value scale. Hovering, tapping or using the arrow keys reads every
 * series for a month, and the same numbers are always available in the table underneath.
 */
export function LineChart({
  locale,
  title,
  months,
  series,
  money,
  partialLastMonth,
}: {
  locale: Locale;
  title: string;
  months: readonly string[];
  series: readonly ChartSeries[];
  money: boolean;
  /** A running total for an unfinished month would look like a collapse, so it gets only a dot. */
  partialLastMonth: boolean;
}) {
  const t = getT(locale);
  const intl = intlLocale[locale];
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const value = (input: number) =>
    money
      ? new Intl.NumberFormat(intl, {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0,
        }).format(input / 100)
      : new Intl.NumberFormat(intl).format(input);
  const axisValue = (input: number) =>
    money
      ? new Intl.NumberFormat(intl, {
          style: 'currency',
          currency: 'EUR',
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(input / 100)
      : new Intl.NumberFormat(intl).format(input);
  const monthLabel = (month: string, style: 'short' | 'long') =>
    new Intl.DateTimeFormat(intl, {
      month: style,
      year: style === 'short' ? '2-digit' : 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${month}-01T00:00:00Z`));

  const narrow = width < narrowWidth;
  const multiple = series.length > 1;
  const directLabels = multiple && !narrow;
  const right = directLabels ? 136 : 16;
  const height = narrow ? 260 : 340;
  const plotWidth = Math.max(0, width - margin.left - right);
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(0, ...series.flatMap((item) => item.values));
  const ticks = money
    ? axisTicks(maxValue / 100).map((tick) => tick * 100)
    : axisTicks(maxValue, true);
  const top = ticks.at(-1) ?? 1;
  const last = months.length - 1;
  const x = (index: number) => margin.left + (last > 0 ? (index * plotWidth) / last : 0);
  const y = (input: number) => margin.top + plotHeight - (input / top) * plotHeight;
  const lineEnd = partialLastMonth ? last - 1 : last;
  const labelEvery = narrow ? 6 : 3;

  function linePath(values: readonly number[]) {
    return values
      .slice(0, lineEnd + 1)
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point)}`)
      .join(' ');
  }
  function areaPath(values: readonly number[]) {
    const baseline = margin.top + plotHeight;
    return `${linePath(values)} L${x(lineEnd)} ${baseline} L${x(0)} ${baseline} Z`;
  }
  function pick(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left - margin.left) / (plotWidth || 1);
    setActive(Math.min(last, Math.max(0, Math.round(position * last))));
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(last);
    else if (event.key === 'Escape') setActive(null);
    else if (steps[event.key] !== undefined)
      setActive((current) =>
        Math.min(last, Math.max(0, (current ?? last + 1) + steps[event.key]!))
      );
    else return;
    event.preventDefault();
  }

  // Labels that would touch are dropped rather than nudged off their lines; the legend still names them.
  const labelled = directLabels
    ? series.filter((item) => {
        const position = y(item.values[lineEnd] ?? 0);
        return !series.some(
          (other) =>
            other.id !== item.id && Math.abs(y(other.values[lineEnd] ?? 0) - position) < labelGap
        );
      })
    : [];
  const tooltipLeft =
    active === null ? 0 : Math.min(Math.max(0, x(active) - 90), Math.max(0, width - 180));

  if (!maxValue)
    return <p className="mt-6 rounded-sm bg-parchment p-6 text-body">{t('admin.chart.empty')}</p>;

  return (
    <>
      {multiple ? (
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
          {series.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-caption">
              <span
                aria-hidden="true"
                className="h-0.5 w-4 rounded-pill"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div
        ref={container}
        role="group"
        tabIndex={0}
        aria-label={t('admin.chart.aria', { title })}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setActive(null);
        }}
        onKeyDown={keyboard}
        onBlur={() => setActive(null)}
        className="relative mt-4 touch-pan-y rounded-sm"
        style={{ height }}
      >
        {width > 0 ? (
          <svg width={width} height={height} aria-hidden="true" className="block">
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={margin.left}
                  x2={margin.left + plotWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--color-hairline)"
                />
                <text
                  x={margin.left - 10}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--color-ink-muted)"
                  className="text-fine tabular-nums"
                >
                  {axisValue(tick)}
                </text>
              </g>
            ))}
            {months.map((month, index) =>
              (last - index) % labelEvery === 0 ? (
                <text
                  key={month}
                  x={x(index)}
                  y={height - 8}
                  textAnchor={index === last ? 'end' : 'middle'}
                  fill="var(--color-ink-muted)"
                  className="text-fine"
                >
                  {monthLabel(month, 'short')}
                </text>
              ) : null
            )}
            {!multiple && series[0] ? (
              <path d={areaPath(series[0].values)} fill={series[0].color} fillOpacity={0.1} />
            ) : null}
            {series.map((item) => (
              <path
                key={item.id}
                d={linePath(item.values)}
                fill="none"
                stroke={item.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {partialLastMonth
              ? series.map((item) => (
                  <circle
                    key={item.id}
                    cx={x(last)}
                    cy={y(item.values[last] ?? 0)}
                    r={4}
                    fill="var(--color-canvas)"
                    stroke={item.color}
                    strokeWidth={2}
                  />
                ))
              : null}
            {labelled.map((item) => (
              <text
                key={item.id}
                x={x(lineEnd) + (partialLastMonth ? plotWidth / last + 10 : 10)}
                y={y(item.values[lineEnd] ?? 0)}
                dominantBaseline="middle"
                fill="var(--color-ink)"
                className="text-fine"
              >
                {item.label}
              </text>
            ))}
            {active !== null ? (
              <g>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={margin.top}
                  y2={margin.top + plotHeight}
                  stroke="var(--color-ink-muted)"
                />
                {series.map((item) => (
                  <circle
                    key={item.id}
                    cx={x(active)}
                    cy={y(item.values[active] ?? 0)}
                    r={4}
                    fill={item.color}
                    stroke="var(--color-canvas)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ) : null}
          </svg>
        ) : null}
        {active !== null ? (
          <div
            aria-live="polite"
            className="pointer-events-none absolute top-0 w-[180px] rounded-sm border border-hairline bg-canvas p-3"
            style={{ left: tooltipLeft }}
          >
            <p className="text-fine text-ink-muted">
              {monthLabel(months[active]!, 'long')}
              {partialLastMonth && active === last ? ` · ${t('admin.chart.monthToDate')}` : ''}
            </p>
            <ul className="mt-2 space-y-1">
              {series.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-fine">
                  <span
                    aria-hidden="true"
                    className="h-0.5 w-3 shrink-0 rounded-pill"
                    style={{ backgroundColor: item.color }}
                  />
                  <strong className="text-caption font-semibold tabular-nums">
                    {value(item.values[active] ?? 0)}
                  </strong>
                  {multiple ? <span className="truncate text-ink-muted">{item.label}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <details className="mt-5 border-t border-divider pt-4">
        <summary className="flex min-h-target cursor-pointer items-center text-caption text-primary">
          {t('admin.chart.table')}
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-caption tabular-nums">
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className="py-2 pr-6 font-semibold">
                  {t('admin.chart.month')}
                </th>
                {series.map((item) => (
                  <th key={item.id} scope="col" className="py-2 pr-6 font-semibold">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((month, index) => (
                <tr key={month} className="border-b border-divider">
                  <th scope="row" className="py-2 pr-6 font-normal whitespace-nowrap">
                    {monthLabel(month, 'long')}
                    {partialLastMonth && index === last ? ` · ${t('admin.chart.monthToDate')}` : ''}
                  </th>
                  {series.map((item) => (
                    <td key={item.id} className="py-2 pr-6 whitespace-nowrap">
                      {value(item.values[index] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
