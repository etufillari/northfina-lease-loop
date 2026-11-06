// The life stamp: which life of the item this is, pressed on like a passport stamp. A first
// life is forest green; a later life is terracotta, so second-hand items read as a feature at a
// glance. Decorative styling around real text: screen readers get "Life 2, checked".
import type { CSSProperties } from 'react';
import { cx } from './cx';

type LifeStampProps = {
  /** The top line, e.g. "Life 2". */
  life: string;
  /** The bottom line, e.g. "Checked". */
  note: string;
  /** True for a later life (terracotta), false for the first (forest). */
  later: boolean;
  size?: 'sm' | 'lg';
  /** Degrees of tilt, so a row of stamps does not look machine-made. */
  tilt?: number;
  className?: string;
};

export function LifeStamp({
  life,
  note,
  later,
  size = 'sm',
  tilt = -8,
  className,
}: LifeStampProps) {
  return (
    <span
      style={{ '--stamp-tilt': `${tilt}deg` } as CSSProperties}
      className={cx(
        'life-stamp inline-flex shrink-0 flex-col items-center justify-center rounded-full',
        'border-[5px] border-double text-center font-heading leading-tight font-semibold uppercase',
        later ? 'border-accent-ink text-accent-ink' : 'border-brand text-brand-text',
        size === 'sm' ? 'size-21 text-[0.58rem]' : 'size-27 text-[0.68rem]',
        className
      )}
    >
      <span>{life}</span>
      <span className="opacity-80">{note}</span>
    </span>
  );
}
