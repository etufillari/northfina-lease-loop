// The logo: a ring (the loop an item goes round) with a terracotta dot where it starts again.
import { cx } from './ui';

export function LoopMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 36 36" className={cx('shrink-0', className)}>
      <circle cx="18" cy="19" r="12" fill="none" stroke="var(--brand)" strokeWidth="5" />
      <circle cx="18" cy="6.5" r="4.5" fill="var(--accent)" />
    </svg>
  );
}
