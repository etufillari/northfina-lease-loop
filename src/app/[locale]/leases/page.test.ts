import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listContracts: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/components/lease-engine-panel', () => ({
  LeaseEnginePanel: ({
    contractId,
    leaseId,
    status,
  }: {
    contractId: string;
    leaseId: string | null;
    status: string;
  }) =>
    createElement(
      'div',
      { 'data-testid': 'lease-engine-panel' },
      `${contractId}:${leaseId}:${status}`
    ),
}));
vi.mock('@/data/load', () => ({ loadAssets: vi.fn().mockResolvedValue([]) }));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/active-user', () => ({
  getActiveUser: vi.fn().mockResolvedValue({ id: 'customer-1' }),
}));
vi.mock('@/server/applications', () => ({ listContractsForCustomer: mocks.listContracts }));
vi.mock('@/server/today', () => ({ todayIso: () => '2026-02-01' }));
vi.mock('@/i18n/get-t', () => ({ getT: () => (key: string) => key }));

import LeasesPage from './page';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('customer lease page', () => {
  it('renders the saved invoice panel for each customer lease', async () => {
    mocks.listContracts.mockResolvedValue([
      {
        signedDate: '2025-10-15',
        leaseId: 'lease-aino-1',
        status: 'ACTIVE',
        terms: {
          contractId: 'contract-aino-1',
          assetId: 'ebike-003',
          startDate: '2025-10-15',
          termMonths: 36,
          monthlyNetCents: 4030,
        },
      },
    ]);

    const markup = renderToStaticMarkup(
      await LeasesPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(markup).toContain('dark:text-stone-100');
    expect(markup).toContain('data-testid="lease-engine-panel"');
    expect(markup).toContain('contract-aino-1:lease-aino-1:ACTIVE');
  });
});
