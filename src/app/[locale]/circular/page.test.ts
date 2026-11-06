import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ dashboard: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'session' }) }) }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/server/company-mode', () => ({ companyModeActive: async () => true }));
vi.mock('@/server/circular/operator-session', () => ({
  OPERATOR_COOKIE: 'operator',
  validOperatorSession: () => true,
}));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/today', () => ({ todayIso: () => '2026-11-06' }));
vi.mock('@/server/circular/queries', () => ({ circularDashboard: mocks.dashboard }));
vi.mock('@/components/lease-engine-panel', () => ({ LeaseEnginePanel: () => null }));
vi.mock('@/components/operator-access', () => ({ OperatorAccess: () => null }));
vi.mock('@/components/circular-actions', () => ({
  CircularActions: ({ currentDate }: { currentDate: string }) =>
    createElement('output', { 'data-workflow-date': currentDate }),
}));
import CircularPage from './page';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('company dashboard simulated dates', () => {
  it.each([
    ['RECEIVED', null, '2028-11-06'],
    ['PENDING_APPROVAL', '2028-11-08', '2028-11-08'],
  ])('passes the saved lifecycle date to %s controls', async (status, completedOn, expected) => {
    vi.stubEnv('NODE_ENV', 'development');
    mocks.dashboard.mockResolvedValue([
      {
        asset: {
          id: 'ebike-003',
          make: 'Test',
          model: 'Bike',
          serial_number: 'serial',
          previous_lives: 1,
          status: 'returned',
          condition: 'good',
          usage: { unit: 'km', value: 50 },
        },
        receipt: {
          id: 'receipt',
          status,
          receivedOn: '2028-11-06',
          completedOn,
          offerNetCents: 50000,
          costCents: null,
        },
        activeLeaseId: null,
        completedLeaseId: null,
        history: [],
        audit: [],
        matches: [],
        offer: null,
        impactGrams: 0,
      },
    ]);
    const html = renderToStaticMarkup(
      await CircularPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ view: 'returned' }),
      })
    );
    expect(html).toContain(`data-workflow-date="${expected}"`);
    expect(html).not.toContain('data-workflow-date="2026-11-06"');
  });
});
