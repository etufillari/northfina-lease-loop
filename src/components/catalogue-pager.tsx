// Paging controls for the catalogue: how many items per page (above the results) and the page
// links (below them). Every page link is a real link to that page of the filtered catalogue,
// so it works without JavaScript; with JavaScript the click is handled in place, like the
// filters. The rules are in src/domain/catalogue-pages.ts.
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { pageLinks, PER_PAGE_OPTIONS, type CataloguePaging } from '@/domain/catalogue-pages';
import type { Translate } from '@/i18n/get-t';

const linkClass =
  'inline-flex min-w-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-950';
const idleClass =
  'border-stone-300 bg-white text-stone-800 hover:border-emerald-600 hover:text-emerald-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:text-emerald-300';
const currentClass = 'border-emerald-700 bg-emerald-700 text-white';

type PerPageSelectProps = {
  perPage: number;
  onChange: (perPage: number) => void;
  t: Translate;
};

export function PerPageSelect({ perPage, onChange, t }: PerPageSelectProps) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      {t('catalogue.perPage')}
      <select
        value={perPage}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
      >
        {PER_PAGE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type PageNavProps = {
  page: number;
  pageCount: number;
  /** The link to a page (the catalogue with today's filters). */
  hrefFor: (page: number) => string;
  onChange: (paging: Pick<CataloguePaging, 'page'>) => void;
  t: Translate;
};

export function PageNav({ page, pageCount, hrefFor, onChange, t }: PageNavProps) {
  if (pageCount <= 1) return null;

  // Let modified clicks (new tab, new window) behave like a normal link.
  const go = (target: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onChange({ page: target });
  };

  const step = (target: number, label: string, arrow: string) =>
    target >= 1 && target <= pageCount ? (
      <li>
        <Link
          href={hrefFor(target)}
          onClick={go(target)}
          className={`${linkClass} ${idleClass} gap-1`}
        >
          {/* The arrow is decoration; a screen reader says only "Previous" or "Next". */}
          {target < page ? <span aria-hidden="true">{arrow}</span> : null}
          {label}
          {target > page ? <span aria-hidden="true">{arrow}</span> : null}
        </Link>
      </li>
    ) : null;

  return (
    <nav aria-label={t('catalogue.pages')} className="mt-8">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {step(page - 1, t('catalogue.previous'), '←')}
        {pageLinks(page, pageCount).map((n, index) =>
          n === 'gap' ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 text-stone-600 dark:text-stone-400"
            >
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                href={hrefFor(n)}
                onClick={go(n)}
                aria-current={n === page ? 'page' : undefined}
                aria-label={t('catalogue.page', { page: n })}
                className={`${linkClass} ${n === page ? currentClass : idleClass}`}
              >
                {n}
              </Link>
            </li>
          )
        )}
        {step(page + 1, t('catalogue.next'), '→')}
      </ul>
    </nav>
  );
}
