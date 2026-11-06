import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listInvoices: vi.fn(),
  schedule: vi.fn(),
  settlement: vi.fn(),
  contract: vi.fn(),
  lease: vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: {
    leaseSettlement: { findUnique: mocks.settlement },
    contract: { findUnique: mocks.contract },
    engineLease: { findUnique: mocks.lease },
  },
}));
vi.mock('@/server/lease-engine/invoices', () => ({ listLeaseInvoices: mocks.listInvoices }));
vi.mock('@/server/lease-engine/queries', () => ({ getLeaseSchedule: mocks.schedule }));
vi.mock('@/i18n/get-t', () => ({ getT: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { LeaseEnginePanel } from './lease-engine-panel';

afterEach(() => {
  vi.clearAllMocks();
});

describe('lease actions', () => {
  it('shows one invoice action and lifecycle placeholders', async () => {
    mocks.listInvoices.mockResolvedValue([]);
    mocks.schedule.mockResolvedValue({
      periods: [{ index: 1, startDate: '2026-11-05' }],
      totalNetCents: 386280,
    });
    mocks.settlement.mockResolvedValue(null);
    mocks.contract.mockResolvedValue({ financed_cents: 0, asset_id: 'ebike-003' });
    mocks.lease.mockResolvedValue({ assetId: 'ebike-003', terminatedOn: null });

    const markup = renderToStaticMarkup(
      await LeaseEnginePanel({
        contractId: 'contract-aino-1',
        leaseId: 'lease-aino-1',
        locale: 'en',
      })
    );

    expect(markup).toContain('engine.generate');
    expect(markup).toContain('end.buy');
    expect(markup).toContain('end.pass');
    expect(markup).toContain('end.early');
    expect(markup).not.toContain('engine.complete');
  });
});
