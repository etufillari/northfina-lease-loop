import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listInvoices: vi.fn(),
  schedule: vi.fn(),
  settlement: vi.fn(),
  contract: vi.fn(),
  lease: vi.fn(),
  assetReturn: vi.fn(),
  asset: vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: {
    leaseSettlement: { findUnique: mocks.settlement },
    contract: { findUnique: mocks.contract },
    engineLease: { findUnique: mocks.lease },
    assetReturn: { findUnique: mocks.assetReturn },
    asset: { findUnique: mocks.asset },
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

describe('active lease demo controls', () => {
  it('shows invoice generation, demo completion, and early-return options', async () => {
    mocks.listInvoices.mockResolvedValue([]);
    mocks.schedule.mockResolvedValue({
      periods: [{ index: 1, startDate: '2026-11-05' }],
      totalNetCents: 386280,
    });
    mocks.settlement.mockResolvedValue(null);
    mocks.contract.mockResolvedValue({ financed_cents: 0, asset_id: 'ebike-003' });
    mocks.lease.mockResolvedValue({ assetId: 'ebike-003', terminatedOn: null });
    mocks.assetReturn.mockResolvedValue(null);
    mocks.asset.mockResolvedValue({ usage_value: 1200, usage_unit: 'km' });

    const markup = renderToStaticMarkup(
      await LeaseEnginePanel({
        contractId: 'contract-aino-1',
        leaseId: 'lease-aino-1',
        status: 'ACTIVE',
        locale: 'en',
      })
    );

    expect(markup).toContain('engine.generate');
    expect(markup).toContain('engine.complete');
    expect(markup).toContain('end.early');
  });

  it('lets a completed lease submit a usage reading before a return receipt exists', async () => {
    mocks.listInvoices.mockResolvedValue([]);
    mocks.schedule.mockResolvedValue(null);
    mocks.settlement.mockResolvedValue(null);
    mocks.contract.mockResolvedValue({ financed_cents: 0, asset_id: 'ebike-003' });
    mocks.lease.mockResolvedValue({ assetId: 'ebike-003', terminatedOn: null });
    mocks.assetReturn.mockResolvedValue(null);
    mocks.asset.mockResolvedValue({ usage_value: 18400, usage_unit: 'km' });

    const markup = renderToStaticMarkup(
      await LeaseEnginePanel({
        contractId: 'contract-aino-1',
        leaseId: 'lease-aino-1',
        status: 'COMPLETED',
        locale: 'en',
      })
    );

    expect(markup).toContain('return.title');
    expect(markup).toContain('18400');
    expect(markup).toContain('return.submit');
  });
});
