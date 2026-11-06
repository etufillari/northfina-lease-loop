'use client';

// A date as three dropdowns: day, month and year, in that order in all four languages. A date
// only reaches the form once all three are chosen. Until then the form holds no date at all.
import { useState } from 'react';

import { daysInMonth } from '@/domain/dates';

const YEARS_BACK = 100;

type DateSelectProps = {
  id: string;
  value: string;
  labels: { day: string; month: string; year: string };
  onChange: (isoDate: string) => void;
  className: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

const pad = (part: string) => part.padStart(2, '0');
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

function partsOf(value: string) {
  const [year = '', month = '', day = ''] = value.split('-');
  return { year, month: month.replace(/^0/, ''), day: day.replace(/^0/, '') };
}

export function DateSelect({
  id,
  value,
  labels,
  onChange,
  className,
  disabled = false,
  invalid = false,
  describedBy,
}: DateSelectProps) {
  const [parts, setParts] = useState(() => partsOf(value));
  const [thisYear] = useState(() => new Date().getFullYear());

  // Without a year or month yet, offer every day: the choice is checked when the rest arrives.
  const lastDay =
    parts.year && parts.month ? daysInMonth(Number(parts.year), Number(parts.month)) : 31;

  function change(next: Partial<typeof parts>) {
    const merged = { ...parts, ...next };
    const year = Number(merged.year);
    const month = Number(merged.month);
    const dayFits = !year || !month || Number(merged.day) <= daysInMonth(year, month);
    const updated = dayFits ? merged : { ...merged, day: '' };

    setParts(updated);

    const isComplete = updated.day !== '' && updated.month !== '' && updated.year !== '';
    const isoDate = `${updated.year}-${pad(updated.month)}-${pad(updated.day)}`;
    if (isComplete) onChange(isoDate);
    else if (value !== '') onChange('');
  }

  const shared = { disabled, 'aria-invalid': invalid, 'aria-describedby': describedBy, className };

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        {...shared}
        id={id}
        aria-label={labels.day}
        value={parts.day}
        onChange={(event) => change({ day: event.target.value })}
      >
        <option value="">{labels.day}</option>
        {range(1, lastDay).map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </select>

      <select
        {...shared}
        aria-label={labels.month}
        value={parts.month}
        onChange={(event) => change({ month: event.target.value })}
      >
        <option value="">{labels.month}</option>
        {range(1, 12).map((month) => (
          <option key={month} value={month}>
            {month}
          </option>
        ))}
      </select>

      <select
        {...shared}
        aria-label={labels.year}
        value={parts.year}
        onChange={(event) => change({ year: event.target.value })}
      >
        <option value="">{labels.year}</option>
        {range(thisYear - YEARS_BACK, thisYear)
          .reverse()
          .map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
      </select>
    </div>
  );
}
