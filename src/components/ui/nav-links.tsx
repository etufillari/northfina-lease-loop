'use client';

// The main navigation links. A client component only because it marks the current page
// with aria-current, which needs the path, and a link to a section (`/en#how-it-works`)
// scrolls there on every click, not only the first.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './cx';
import { onSectionLinkClick } from './hash-link';

export type NavItem = { href: string; label: string };

export function NavLinks({
  items,
  label,
  vertical = false,
}: {
  items: NavItem[];
  label: string;
  /** True in the phone menu: one link per row. */
  vertical?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className={cx('flex gap-1', vertical ? 'flex-col' : 'flex-wrap')}>
        {items.map((item) => {
          // The catalogue is /en; every other page is /en/<page> and owns its sub-pages.
          const isRoot = item.href.split('/').length === 2;
          const active = isRoot
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={(event) => onSectionLinkClick(event, item.href, pathname)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'block rounded-full px-4 py-2 font-semibold transition-colors',
                  active ? 'bg-brand-soft text-brand-text' : 'text-ink hover:bg-muted'
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
