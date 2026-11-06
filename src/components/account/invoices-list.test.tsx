import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import InvoicesList from './invoices-list';

const en = messages.en;

const december = {
  id: 'inv-1',
  contract_id: 'con-1',
  sequence: 4,
  kind: 'rent',
  invoice_date: '2026-12-15',
  due_date: '2026-12-15',
  net_cents: 6_957,
  vat_rate_percent: 25.5,
  vat_cents: 1_774,
  total_cents: 8_731,
  status: 'issued',
  vat_change: null,
};
const january = {
  ...december,
  id: 'inv-2',
  sequence: 5,
  invoice_date: '2027-01-15',
  due_date: '2027-01-15',
  vat_rate_percent: 26,
  vat_cents: 1_809,
  total_cents: 8_766,
  vat_change: {
    from_percent: 25.5,
    to_percent: 26,
    net_change_cents: 0,
    total_change_cents: 35,
  },
};

async function renderList(invoices: unknown[] = [december, january], locale: Locale = 'en') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ success: true, data: invoices })))
  );
  render(<InvoicesList locale={locale} />);
  await screen.findAllByRole('heading');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoicesList', () => {
  it('numbers each invoice and says what it is for', async () => {
    await renderList();

    expect(screen.getByRole('heading', { name: 'Invoice 5' })).toBeTruthy();
    expect(screen.getAllByText(en['contract.invoiceKind.rent'])).toHaveLength(2);
  });

  it('splits the total into net and VAT, with the rate', async () => {
    await renderList();

    expect(screen.getByText(/\(25\.5 %\)/)).toHaveTextContent('€17.74');
    expect(screen.getByText(/\(26 %\)/)).toHaveTextContent('€18.09');
    expect(screen.getAllByText(/€69\.57/)).toHaveLength(2);
    expect(screen.getByText('€87.66')).toBeTruthy();
  });

  it('explains the invoice where the total changes, and only that one', async () => {
    await renderList();

    const notes = screen.getAllByText(/Your rent is locked/);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent('+€0.35');
    expect(notes[0]).toHaveTextContent('25.5 % to 26 %');
  });

  it('formats numbers for the page language', async () => {
    await renderList([january], 'fi');
    expect(screen.getByText(/Vuokrasi on lukittu/)).toHaveTextContent('25,5');
  });
});
