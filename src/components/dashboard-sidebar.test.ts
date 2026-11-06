import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import { DashboardSidebar } from './dashboard-sidebar';

describe('company operations navigation', () => {
  it('places company operations above Dev mode below the sidebar divider', () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardSidebar, {
        locale: 'en',
        activeUserData: [[], null],
        companyMode: false,
      })
    );

    expect(markup.indexOf('Company operations')).toBeLessThan(markup.indexOf('Dev mode'));
    expect(markup).toContain('border-t border-white/15');
  });

  it('shows the Returned navigation item and admin profile in company mode', () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardSidebar, {
        locale: 'en',
        activeUserData: [[], null],
        companyMode: true,
      })
    );

    expect(markup).toContain('Returned');
    expect(markup).toContain('Company admin');
    expect(markup).not.toContain('Browse Catalogue');
  });
});
