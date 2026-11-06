import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatEuro } from '@/domain/money';
import { messages } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ContractPreview as ContractPreviewView } from '@/server/contract/contracts';
import ContractPreview from './contract-preview';

const en = messages.en;

// Intl uses no-break spaces; compare with plain spaces so the tests are readable.
const plain = (text: string) => text.replace(/\s/g, ' ');

const rent = (sequence: number, invoiceDate: string, vatCents: number, rate: number) => ({
  sequence,
  kind: 'rent' as const,
  period_start: invoiceDate,
  period_end: invoiceDate,
  invoice_date: invoiceDate,
  due_date: invoiceDate,
  net_cents: 10_730,
  vat_rate_basis_points: rate * 100,
  vat_rate_percent: rate,
  vat_cents: vatCents,
  total_cents: 10_730 + vatCents,
  status: 'issued' as const,
  vat_change: null,
});

const preview = {
  application_id: 'app-1',
  customer_id: 'cust-aino',
  asset_id: 'ebike-003',
  asset_name: 'Kettu Bikes City',
  quote_date: '2026-11-05',
  signed_on: '2026-11-05',
  start_on: '2026-11-05',
  planned_end_on: '2029-11-04',
  calculated_on: '2026-11-05',
  list_price_on_signing_cents: 389_000,
  price_list_version: 1,
  base_price_cents: 389_000,
  down_payment_cents: 0,
  financed_cents: 389_000,
  term_months: 36,
  band: 'B',
  factor_micros: 27_584,
  annual_interest_basis_points: 490,
  monthly_net_rent_cents: 10_730,
  buyout_cents: 58_350,
  total_net_cents: 386_280,
  total_vat_cents: 100_332,
  total_cents: 486_612,
  upcoming_vat_change: {
    effective_on: '2027-01-01',
    rate_percent: 26,
    monthly_total_cents: 13_520,
    monthly_change_cents: 54,
  },
  can_sign: true,
  signatory_email: null,
  invoices: [
    rent(1, '2026-12-05', 2_736, 25.5),
    {
      ...rent(2, '2027-01-05', 2_790, 26),
      vat_change: {
        from_percent: 25.5,
        to_percent: 26,
        net_change_cents: 0,
        total_change_cents: 54,
      },
    },
  ],
} as ContractPreviewView;

async function renderPreview(locale: Locale = 'en', overrides: Partial<ContractPreviewView> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: { ...preview, ...overrides } }))
    )
  );
  render(<ContractPreview locale={locale} applicationId="app-1" />);
  await screen.findByRole('heading', { name: messages[locale]['contract.title'] });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContractPreview', () => {
  it('names the item, not its id', async () => {
    await renderPreview();

    expect(screen.getByText('Kettu Bikes City')).toBeTruthy();
    expect(screen.queryByText('ebike-003')).toBeNull();
  });

  it('has no quantity row', async () => {
    await renderPreview();
    expect(screen.queryByText(/quantity/i)).toBeNull();
  });

  it('gives the real total, split into rent and VAT', async () => {
    await renderPreview();

    expect(screen.getByText('€3,862.80')).toBeTruthy();
    expect(screen.getByText('€1,003.32')).toBeTruthy();
    expect(screen.getByText('€4,866.12')).toBeTruthy();
  });

  it('warns about a VAT change before signing, and says the rent stays locked', async () => {
    await renderPreview();

    const warning = screen.getByRole('note');
    expect(warning).toHaveTextContent('1 January 2027');
    expect(warning).toHaveTextContent('26 %');
    expect(warning).toHaveTextContent('€135.20 (+€0.54)');
    expect(warning).toHaveTextContent('€107.30');
  });

  it('gives no warning when VAT stays the same', async () => {
    await renderPreview('en', { upcoming_vat_change: null });
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('explains the invoice where the total changes, and only that one', async () => {
    await renderPreview();

    const notes = screen.getAllByText(/Your rent is locked/);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent('+€0.54');
    expect(notes[0]).toHaveTextContent('25.5 % to 26 %');
  });

  it('shows a falling total with a minus sign', async () => {
    const lower = {
      ...rent(2, '2027-01-05', 2_575, 24),
      vat_change: {
        from_percent: 25.5,
        to_percent: 24,
        net_change_cents: 0,
        total_change_cents: -161,
      },
    };
    await renderPreview('en', { invoices: [rent(1, '2026-12-05', 2_736, 25.5), lower] });

    expect(screen.getByText(/Your rent is locked/)).toHaveTextContent('-€1.61');
  });

  it('translates the kind of invoice', async () => {
    await renderPreview('fi');
    expect(screen.getAllByText(messages.fi['contract.invoiceKind.rent'])).toHaveLength(2);
    expect(screen.queryByText('rent')).toBeNull();
  });

  it.each<Locale>(['fi', 'sv', 'et'])('formats money and numbers for %s', async (locale) => {
    await renderPreview(locale);

    const total = plain(formatEuro(486_612, intlLocale[locale]));
    expect(screen.getByText((text) => plain(text) === total)).toBeTruthy();
    expect(screen.getByText('4,90 %')).toBeTruthy();
  });

  it('formats dates for the page language', async () => {
    await renderPreview('fi');
    expect(screen.getByRole('note')).toHaveTextContent('1. tammikuuta 2027');
  });

  it('can still be signed', async () => {
    await renderPreview();

    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 201 }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: en['contract.sign'] }));

    expect(await screen.findByText(en['contract.signed'])).toBeTruthy();
  });
});
