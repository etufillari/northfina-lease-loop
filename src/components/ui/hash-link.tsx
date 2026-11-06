'use client';

// A link to a section of a page (`/en#how-it-works`) that scrolls there every time it is
// clicked. Next's router does nothing when the URL already ends in the same hash, so after one
// click and a scroll back up the link went dead. On the page it points to, the click scrolls
// the section into view itself and moves focus there; from any other page it is a plain link,
// and `HashTargetFocus` moves focus to the section once the page it lands on is shown.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ComponentProps, type MouseEvent } from 'react';
import { sectionOnPage } from './section-hash';

/** Focuses an element that is not focusable by itself, without scrolling to it. */
function focusSection(target: HTMLElement) {
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/** Scrolls to `href`'s section when it is on the current page; true when it did. */
export function scrollToSection(href: string, pathname: string): boolean {
  const id = sectionOnPage(href, pathname);
  const target = id === null ? null : document.getElementById(id);
  if (!target) return false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  focusSection(target);
  const hash = `#${encodeURIComponent(target.id)}`;
  // A history entry, as a plain anchor adds, so Back undoes the jump. Next's own state is kept,
  // and a click on a hash the URL already has adds nothing, so repeated clicks don't pile up.
  if (window.location.hash !== hash) window.history.pushState(window.history.state, '', hash);
  return true;
}

/** Plain clicks only: a modified click (new tab, new window) keeps the browser's behaviour. */
export function onSectionLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  pathname: string
) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  // The phone menu is a <details>: close it, or its panel covers the section it led to.
  event.currentTarget.closest('details[data-nav-menu]')?.removeAttribute('open');
  if (scrollToSection(href, pathname)) event.preventDefault();
}

/**
 * Arriving from another page (`/en/catalogue` → `/en#how-it-works`), Next scrolls to the
 * section but leaves focus where it was; this moves it to the section, as a click on the same
 * page does. Mounted once in the layout; it renders nothing.
 */
export function HashTargetFocus() {
  const pathname = usePathname();
  useEffect(() => {
    const id = sectionOnPage(window.location.hash, pathname);
    const target = id === null ? null : document.getElementById(id);
    if (target) focusSection(target);
  }, [pathname]);
  return null;
}

type HashLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

export function HashLink({ href, onClick, ...rest }: HashLinkProps) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        onSectionLinkClick(event, href, pathname);
      }}
      {...rest}
    />
  );
}
