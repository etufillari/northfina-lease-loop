import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import type { ReviewCase } from '@/server/application/manual-review';
import { ManualReviewCard } from './manual-review-card';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const en = messages.en;

const reviewCase: ReviewCase = {
  id: 'app-1',
  customer_id: 'cust-haapala',
  asset_id: 'farm-002',
  quote_date: '2026-11-05',
  term_months: 48,
  base_price_cents: 14_500_000,
  down_payment_cents: 2_000_000,
  financed_cents: 12_500_000,
  reasons: ['pep_manual_review'],
  customer_name: 'Haapalan Tila Oy',
  customer_type: 'company',
  recorded_pep: true,
  asset_name: 'Valtra N175',
  answers: [
    { id: 'q_pep', text: 'Are you a politically exposed person?', value: 'no' },
    { id: 'q_annual_revenue', text: 'Annual revenue', value: 95_000_000 },
  ],
};

const respondWith = (status: number) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));

const renderCard = (overrides: Partial<ReviewCase> = {}) =>
  render(<ManualReviewCard reviewCase={{ ...reviewCase, ...overrides }} locale="en" />);

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManualReviewCard', () => {
  it('shows who is asking, for what, and why a person is needed', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Haapalan Tila Oy' })).toBeTruthy();
    expect(screen.getByText('Valtra N175')).toBeTruthy();
    expect(screen.getByText(en['application.reason.pep_manual_review'])).toBeTruthy();
  });

  it('warns about a recorded PEP, next to the answer that says no', () => {
    renderCard();

    expect(screen.getByText(en['admin.review.recordedPep'])).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('gives no PEP warning when the records show none', () => {
    renderCard({ recorded_pep: false });
    expect(screen.queryByText(en['admin.review.recordedPep'])).toBeNull();
  });

  it('shows money answers in euros', () => {
    renderCard();
    expect(screen.getByText('€950,000.00')).toBeTruthy();
  });

  it.each([
    ['approved', 'admin.review.approve'],
    ['rejected', 'admin.review.reject'],
  ] as const)('sends %s and reloads the list', async (decision, label) => {
    respondWith(200);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: en[label] }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/applications/app-1/decision',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision }) })
    );
  });

  it('blocks a second click while the decision is saving', async () => {
    respondWith(200);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: en['admin.review.approve'] }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(
      screen.getByRole('button', { name: en['admin.review.reject'] }).hasAttribute('disabled')
    ).toBe(true);
  });

  it('says so when the decision fails, and lets the reviewer try again', async () => {
    respondWith(409);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: en['admin.review.approve'] }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: en['admin.review.approve'] }).hasAttribute('disabled')
    ).toBe(false);
  });
});
