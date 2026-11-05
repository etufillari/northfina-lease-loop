'use client';

import type { ReactNode, MouseEvent } from 'react';

type AssetCardLinkProps = {
  href: string;
  children: ReactNode;
};

export function AssetCardLink({ href, children }: AssetCardLinkProps) {
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const query = window.location.search;
    window.location.assign(`${href}${query}`);
  }

  return (
    <a
      href={href}
      onClick={navigate}
      className="block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
    >
      {children}
    </a>
  );
}
