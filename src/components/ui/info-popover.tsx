// A small "how is this counted?" note: a button with an info glyph whose text shows on hover,
// on keyboard focus and on a tap (a tap focuses the button). The text is the button's
// description (aria-describedby), so a screen reader reads it with the button; it is only
// hidden from sight, never from assistive technology. No JavaScript, so server pages use it.
import type { ReactNode } from 'react';
import { cx } from './cx';

type InfoPopoverProps = {
  /** Unique on the page: ties the button to its text. */
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
};

export function InfoPopover({ id, label, children, className }: InfoPopoverProps) {
  return (
    <div className={cx('group relative inline-block', className)}>
      <button
        type="button"
        aria-describedby={id}
        className="inline-flex items-center gap-2 rounded text-sm font-bold text-brand-text underline decoration-2 underline-offset-4"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        {label}
      </button>
      <div
        id={id}
        role="tooltip"
        className="invisible absolute bottom-full left-0 z-10 mb-3 w-80 max-w-[calc(100vw-4rem)] space-y-2 rounded-lg bg-raised p-4 text-sm font-normal text-ink opacity-0 shadow-panel transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {children}
      </div>
    </div>
  );
}
