import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import type { HeldItem } from '@/server/second-life/dealer-dashboard';
import { HeldItemCard } from './held-item-card';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const en = messages.en;

const item: HeldItem = {
  id: 'ebike-012',
  category: 'e_bike',
  make: 'Kettu Bikes',
  model: 'Urban 2',
  model_year: 2024,
  serial_number: 'LL-EB-1',
  condition: 'good',
  usage: { unit: 'km', value: 1_000 },
  previous_lives: 1,
  status: 'available',
  reserved_for: 'cust-wait-02',
  held_for_name: 'Jonas Lind',
};

const respondWith = (status: number) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));

const clickRelease = () =>
  fireEvent.click(screen.getByRole('button', { name: en['dealer.held.release'] }));

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HeldItemCard', () => {
  it('says who the item is held for', () => {
    render(<HeldItemCard item={item} locale="en" />);
    expect(screen.getByText('Held for Jonas Lind')).toBeTruthy();
  });

  it('releases the item and reloads the list', async () => {
    respondWith(200);
    render(<HeldItemCard item={item} locale="en" />);

    clickRelease();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/assets/ebike-012/release', { method: 'POST' });
  });

  it('says so when it cannot be released', async () => {
    respondWith(409);
    render(<HeldItemCard item={item} locale="en" />);

    clickRelease();

    expect(await screen.findByRole('alert')).toHaveTextContent(en['dealer.error']);
  });
});
