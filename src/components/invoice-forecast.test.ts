import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoiceForecast } from './invoice-forecast';
import type { LeaseTerms } from '@/domain/lease-engine/types';
const terms: LeaseTerms = {
  contractId: 'contract',
  assetId: 'ebike-001',
  customerId: 'cust-aino',
  startDate: '2026-09-15',
  termMonths: 24,
  monthlyNetCents: 10000,
  paymentDueDays: 14,
};
describe('signed invoice forecast', () => {
  it('shows the tax change and fixed net rent without issuing invoices', async () => {
    const html = renderToStaticMarkup(await InvoiceForecast({ terms, locale: 'en' }));
    expect(html).toContain('2026-12-15');
    expect(html).toContain('2027-01-15');
    expect(html).toContain('25.5%');
    expect(html).toContain('26%');
    expect(html).toContain('VAT changes; net rent stays fixed');
    expect(html).toContain('Projection, not issued invoices or payments');
  });
  it('does not forecast rent after early termination', async () => {
    const html = renderToStaticMarkup(
      await InvoiceForecast({ terms, locale: 'en', terminatedOn: '2027-01-15' })
    );
    expect(html).toContain('2026-12-15');
    expect(html).not.toContain('2027-01-15');
  });
  it('shows the clamped February dates and due dates across leap years', async () => {
    const html = renderToStaticMarkup(
      await InvoiceForecast({
        terms: { ...terms, startDate: '2026-01-31', termMonths: 36 },
        locale: 'en',
      })
    );
    for (const date of ['2026-02-28', '2026-03-14', '2028-02-29', '2028-03-14'])
      expect(html).toContain(date);
  });
});
