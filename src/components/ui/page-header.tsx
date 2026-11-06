// The top of every page: an optional back link, the one <h1>, an optional intro and actions.
import Link from 'next/link';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: ReactNode;
  intro?: ReactNode;
  /** A link back up, e.g. `{ href: '/en', label: 'Catalogue' }`. */
  back?: { href: string; label: string };
  /** Buttons or a badge shown beside the title on wide screens, under it on a phone. */
  actions?: ReactNode;
  /** Anything under the intro, e.g. the catalogue's "prices on" badge. */
  children?: ReactNode;
};

export function PageHeader({ title, intro, back, actions, children }: PageHeaderProps) {
  return (
    <header className="mb-8 sm:mb-10">
      {back ? (
        <Link
          href={back.href}
          className="mb-5 inline-flex items-center gap-1 rounded font-bold text-ink underline decoration-brand/30 decoration-2 underline-offset-4 hover:decoration-brand"
        >
          <span aria-hidden="true">←</span>
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl min-w-0">
          <h1 className="text-4xl leading-tight text-balance sm:text-5xl">{title}</h1>
          {intro ? <p className="mt-3 text-lg text-ink-muted">{intro}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}
