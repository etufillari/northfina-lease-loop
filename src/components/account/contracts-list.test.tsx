import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import ContractsList from './contracts-list';

const en = messages.en;

const contract = {
  id: 'con-1',
  application_id: 'app-1',
  customer_id: 'cust-olavi',
  asset_id: 'laptop-002',
  asset_name: 'Pohja Compute Pro 14',
  signed_on: '2026-01-02',
  start_on: '2026-01-02',
  planned_end_on: '2027-01-01',
  actual_end_on: null,
  passed_to: null,
  passed_to_name: null,
  status: 'active',
  term_months: 12,
  monthly_net_rent_cents: 11_000,
  buyout_cents: 80_000,
  total_cents: 165_672,
  end_choice: 'open',
  choice_deadline: '2027-01-08',
};

const respond = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

async function renderList(contracts: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(contracts)));
  render(<ContractsList locale="en" />);
  await screen.findAllByRole('article');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContractsList', () => {
  it('names the item, not its id', async () => {
    await renderList([contract]);

    expect(screen.getByText('Pohja Compute Pro 14')).toBeTruthy();
    expect(screen.queryByText('laptop-002')).toBeNull();
  });

  it('gives the total cost', async () => {
    await renderList([contract]);
    expect(screen.getByText('€1,656.72')).toBeTruthy();
  });

  it('says who an item went to, by name', async () => {
    await renderList([
      {
        ...contract,
        status: 'passed_on',
        end_choice: 'closed',
        passed_to: 'cust-wait-06',
        passed_to_name: 'Noora Heikkinen',
      },
    ]);

    expect(screen.getByText(/Noora Heikkinen/)).toBeTruthy();
    expect(screen.queryByText(/cust-wait-06/)).toBeNull();
  });

  it('shows a failed action once, however many contracts there are', async () => {
    await renderList([contract, { ...contract, id: 'con-2' }]);
    vi.stubGlobal('confirm', () => true);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: { message: 'No.' } }), { status: 409 })
    );

    fireEvent.click(screen.getAllByRole('button', { name: en['account.contracts.return'] })[0]!);

    expect(await screen.findAllByRole('alert')).toHaveLength(1);
  });
});
