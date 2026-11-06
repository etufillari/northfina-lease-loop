// A section that starts closed: a bar with its heading (and one line saying what is inside)
// that opens on click. For detail most people skip but some want, like the price breakdown.
// Native <details>, so it works without JavaScript and with the keyboard.
import type { ReactNode } from 'react';
import { cx } from './cx';

type DisclosureProps = {
  title: ReactNode;
  /** One line under the heading, e.g. what the section answers. */
  summary?: ReactNode;
  /** False for content that runs to the edges, e.g. a table. */
  padded?: boolean;
  /** Starts open, e.g. when the page opens on a preset the visitor should see explained. */
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
};

export function Disclosure({
  title,
  summary,
  padded = true,
  defaultOpen = false,
  className,
  children,
}: DisclosureProps) {
  return (
    <details
      open={defaultOpen || undefined}
      className={cx('group rounded-xl border border-line bg-raised shadow-card', className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl p-4 sm:px-6">
        <div>
          <h2 className="text-xl">{title}</h2>
          {summary ? <p className="mt-0.5 text-sm text-ink-muted">{summary}</p> : null}
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6 shrink-0 text-brand-text transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className={cx('border-t border-line', padded && 'p-4 sm:p-6')}>{children}</div>
    </details>
  );
}
