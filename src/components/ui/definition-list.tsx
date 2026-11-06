// Label/value rows: every "explain my price" and breakdown uses this.
//   rows: one line per item, label left, value right (money right-aligned, tabular figures)
//   grid: two columns of small facts, label above value (the asset card)
import type { ReactNode } from 'react';
import { cx } from './cx';

export type DefinitionItem = {
  label: ReactNode;
  value: ReactNode;
  /** Right-aligned with tabular figures, for money and numbers. */
  numeric?: boolean;
  /** A total: a rule above it and bold text. */
  total?: boolean;
  /** A short explanation under the label, e.g. "band B, factor 0.027584". */
  hint?: ReactNode;
};

type DefinitionListProps = {
  items: DefinitionItem[];
  variant?: 'rows' | 'grid';
  className?: string;
};

export function DefinitionList({ items, variant = 'rows', className }: DefinitionListProps) {
  if (variant === 'grid') {
    return (
      <dl className={cx('grid grid-cols-2 gap-x-4 gap-y-3 text-sm', className)}>
        {items.map((item, index) => (
          <div key={index}>
            <dt className="text-ink-muted">{item.label}</dt>
            <dd className={cx('font-medium', item.numeric && 'tabular-nums')}>{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className={cx('divide-y divide-line text-sm sm:text-base', className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className={cx(
            'flex items-baseline justify-between gap-4 py-2.5',
            item.total && 'border-t-2 border-ink font-semibold'
          )}
        >
          <dt className="min-w-0">
            <span className={item.total ? undefined : 'text-ink-muted'}>{item.label}</span>
            {item.hint ? <span className="block text-xs text-ink-muted">{item.hint}</span> : null}
          </dt>
          <dd className={cx('text-right', item.numeric && 'tabular-nums whitespace-nowrap')}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
