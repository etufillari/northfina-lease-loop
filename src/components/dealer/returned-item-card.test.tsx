import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/data/schemas';
import { messages } from '@/i18n/get-t';
import { ReturnedItemCard } from './returned-item-card';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const en = messages.en;

const asset: Asset = {
  id: 'ebike-007',
  category: 'e_bike',
  make: 'Nordvolt',
  model: 'Cargo Duo',
  model_year: 2023,
  serial_number: 'LL-EB-240822',
  condition: 'fair',
  usage: { unit: 'km', value: 18_400 },
  previous_lives: 1,
  status: 'returned',
};

const preview = {
  market_value_cents: 132_529,
  age_months: 42,
  curve_basis_points: 3_550,
  condition_basis_points: 8_500,
  usage_basis_points: 8_000,
  asset_id: 'ebike-007',
  condition: 'good',
  usage_value: 18_400,
  first_leased_on: '2023-04-11',
  first_lease_price_cents: 549_000,
};

const priced = () => new Response(JSON.stringify({ success: true, data: preview }));
const refused = (code: string, marketValue?: number) =>
  new Response(
    JSON.stringify({
      success: false,
      error: { code, details: { market_value_cents: marketValue } },
    }),
    { status: 422 }
  );

const answerWith = (...responses: Response[]) => {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderCard = () => render(<ReturnedItemCard asset={asset} locale="en" />);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const checkPrice = () => fireEvent.click(button(en['dealer.check']));
const usageInput = () => screen.getByRole('spinbutton');
const conditionSelect = () => screen.getByRole('combobox');

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReturnedItemCard', () => {
  it('starts from what is on record, with the unit of the item', () => {
    renderCard();

    expect(conditionSelect()).toHaveValue('fair');
    expect(usageInput()).toHaveValue(18_400);
    expect(screen.getByLabelText(`${en['asset.usage']} (km)`)).toBeTruthy();
  });

  it('offers no re-listing before the price is checked', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /Re-list/ })).toBeNull();
  });

  it('asks for the price of what the dealer entered', async () => {
    const fetchMock = answerWith(priced());
    renderCard();

    fireEvent.change(conditionSelect(), { target: { value: 'good' } });
    fireEvent.change(usageInput(), { target: { value: '20000' } });
    checkPrice();

    await screen.findByRole('button', { name: /Re-list/ });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/assets/ebike-007/relist-quote?condition=good&usage=20000'
    );
  });

  it('shows how the price was reached', async () => {
    answerWith(priced());
    renderCard();
    checkPrice();

    expect(await screen.findByText('€5,490.00')).toBeTruthy();
    expect(screen.getByText('35.5 %')).toBeTruthy();
    expect(screen.getByText('85 %')).toBeTruthy();
    expect(screen.getByText('80 %')).toBeTruthy();
    expect(screen.getByText('€1,325.29')).toBeTruthy();
  });

  it('explains a refusal and what the item is worth as it is', async () => {
    answerWith(refused('CONDITION_TOO_LOW', 101_345));
    renderCard();
    checkPrice();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      en['dealer.refused.conditionTooLow']
    );
    expect(screen.getByRole('alert')).toHaveTextContent('€1,013.45');
    expect(screen.queryByRole('button', { name: /Re-list/ })).toBeNull();
  });

  it.each([
    ['condition', () => fireEvent.change(conditionSelect(), { target: { value: 'like_new' } })],
    ['usage', () => fireEvent.change(usageInput(), { target: { value: '1' } })],
  ])('clears the checked price when the %s changes', async (_name, change) => {
    answerWith(priced());
    renderCard();
    checkPrice();
    await screen.findByRole('button', { name: /Re-list/ });

    change();

    expect(screen.queryByRole('button', { name: /Re-list/ })).toBeNull();
  });

  it.each(['', '-5', '1.5'])('will not check a usage of "%s"', (value) => {
    renderCard();
    fireEvent.change(usageInput(), { target: { value } });

    expect(button(en['dealer.check'])).toBeDisabled();
  });

  it('re-lists what was checked and reloads the list', async () => {
    const fetchMock = answerWith(priced(), priced());
    renderCard();
    fireEvent.change(conditionSelect(), { target: { value: 'good' } });
    checkPrice();

    fireEvent.click(await screen.findByRole('button', { name: /Re-list at €1,325.29/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/assets/ebike-007/relist',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ condition: 'good', usage_value: 18_400 }),
      })
    );
  });

  it('says so when the item has gone from the list', async () => {
    answerWith(priced(), refused('ASSET_NOT_RETURNED'));
    renderCard();
    checkPrice();

    fireEvent.click(await screen.findByRole('button', { name: /Re-list/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['dealer.refused.notReturned']);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('falls back to a plain message for a failure it does not know', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderCard();
    checkPrice();

    expect(await screen.findByRole('alert')).toHaveTextContent(en['dealer.error']);
  });
});
