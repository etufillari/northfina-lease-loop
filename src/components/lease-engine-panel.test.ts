import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listInvoices: vi.fn(),
  schedule: vi.fn(),
  settlement: vi.fn(),
  contract: vi.fn(),
  lease: vi.fn(),
  receipt: vi.fn(),
  asset: vi.fn(),
}));

vi.mock('./invoice-forecast', () => ({ InvoiceForecast: () => null }));
vi.mock('@/server/db', () => ({
  db: {
    leaseSettlement: { findUnique: mocks.settlement },
    assetReturn: { findUnique: mocks.receipt },
    asset: { findUnique: mocks.asset },
    contract: { findUnique: mocks.contract },
    engineLease: { findUnique: mocks.lease },
  },
}));
vi.mock('@/server/lease-engine/invoices', () => ({ listLeaseInvoices: mocks.listInvoices }));
vi.mock('@/server/lease-engine/queries', () => ({ getLeaseSchedule: mocks.schedule }));
vi.mock('@/i18n/get-t', () => ({ getT: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { LeaseEnginePanel } from './lease-engine-panel';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('active lease demo controls', () => {
  it.each([false, true])('shows operator controls only for operator=%s', async (operator) => {
    mocks.listInvoices.mockResolvedValue([]);
    mocks.schedule.mockResolvedValue({
      periods: [{ index: 1, startDate: '2026-11-05' }],
      totalNetCents: 386280,
    });
    mocks.settlement.mockResolvedValue(null);
    mocks.contract.mockResolvedValue({ financed_cents: 0, asset_id: 'ebike-003' });
    mocks.lease.mockResolvedValue({
      id: 'lease-aino-1',
      contractId: 'contract-aino-1',
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      startDate: '2026-11-05',
      termMonths: 36,
      monthlyNetCents: 10730,
      paymentDueDays: 14,
      status: 'ACTIVE',
      version: 1,
      terminatedOn: null,
    });

    const markup = renderToStaticMarkup(
      await LeaseEnginePanel({
        contractId: 'contract-aino-1',
        leaseId: 'lease-aino-1',
        status: 'ACTIVE',
        locale: 'en',
        operator,
      })
    );

    expect(markup.includes('engine.generate')).toBe(operator);
    expect(markup.includes('engine.complete')).toBe(operator);
    expect(markup.includes('end.early')).toBe(!operator);
    expect(markup.includes('journey.demo')).toBe(
      !operator && process.env.NODE_ENV === 'development'
    );
  });
});

describe('completed lease guidance', () => {
  it.each([
    null,
    { option: 'RETURN', grossCents: 0, effectiveOn: '2029-11-05' },
    { option: 'BUYOUT', grossCents: 10000, effectiveOn: '2029-11-05' },
  ])('explains the next step after completion or selection: %j', async (settlement) => {
    mocks.listInvoices.mockResolvedValue([]);
    mocks.schedule.mockResolvedValue(null);
    mocks.contract.mockResolvedValue(null);
    mocks.lease.mockResolvedValue(null);
    mocks.receipt.mockResolvedValue(null);
    mocks.settlement.mockResolvedValue(settlement);
    const html = renderToStaticMarkup(
      await LeaseEnginePanel({ contractId: 'c', leaseId: 'l', status: 'COMPLETED', locale: 'en' })
    );
    expect(html).toContain(settlement ? 'journey.saved' : 'journey.completed');
    expect(html).not.toContain('journey.demo');
    if (!settlement)
      for (const text of ['journey.returnHelp', 'journey.passHelp', 'journey.buyHelp'])
        expect(html).toContain(text);
    else
      expect(html).toContain(
        settlement.option === 'BUYOUT' ? 'journey.buyoutNext' : 'operator.returnInstructions'
      );
  });
});
