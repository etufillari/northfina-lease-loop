// The price tag: the monthly price as the biggest number on the page, on a forest-green tag
// with a punched hole. No hooks, so server and client pages share it. Pass `flipKey` (e.g. the
// amount in cents) to make the number flip in when it changes; reduced motion turns that off.
import type { ReactNode } from 'react';
import { cx } from './cx';

export type PriceTagLine = { label: string; value: ReactNode };

type PriceTagProps = {
  label: string;
  amount: ReactNode;
  /** The line under the amount, e.g. "per month · 36 months · VAT 25.5 % included". */
  sub?: ReactNode;
  /** Smaller figures under a dashed rule, e.g. the two totals. */
  lines?: PriceTagLine[];
  flipKey?: string | number;
  size?: 'sm' | 'lg';
  className?: string;
};

export function PriceTag({
  label,
  amount,
  sub,
  lines,
  flipKey,
  size = 'lg',
  className,
}: PriceTagProps) {
  return (
    <div className={cx('price-tag py-4 pr-5', size === 'lg' && 'py-6 pr-6', className)}>
      <p className="text-xs font-bold tracking-widest uppercase opacity-85">{label}</p>
      <p
        className={cx(
          'font-heading leading-none font-semibold tabular-nums',
          // Sized for the narrowest panel it sits in (21rem from tablet width), so a farm
          // machine's €8,268.57 fits as well as an e-bike's €134.66.
          size === 'lg' ? 'mt-2 text-4xl lg:text-5xl xl:text-6xl' : 'mt-1 text-3xl'
        )}
      >
        <span key={flipKey} className={flipKey === undefined ? undefined : 'price-flip'}>
          {amount}
        </span>
      </p>
      {sub ? <p className="mt-2 text-sm opacity-90">{sub}</p> : null}
      {lines && lines.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t-2 border-dashed border-current/35 pt-4">
          {lines.map((line) => (
            <div key={line.label}>
              <dt className="text-xs font-bold tracking-wider uppercase opacity-85">
                {line.label}
              </dt>
              <dd className="font-heading text-xl font-semibold tabular-nums">{line.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
