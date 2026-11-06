import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import ApplicationsList from './applications-list';

const en = messages.en;

const application = {
  id: 'app-1',
  asset_id: 'laptop-008',
  quote_date: '2026-11-05',
  start_on: '2026-11-05',
  term_months: 36,
  down_payment_cents: 0,
  financed_cents: 100_000,
  decision: 'rejected',
  reasons: ['min_age'],
  reviewed_by: null as string | null,
  eligible_from: '2027-03-10' as string | null,
  contract_id: null,
};

async function renderList(overrides: Partial<typeof application>, locale: Locale = 'en') {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: [{ ...application, ...overrides }] }))
    )
  );
  render(<ApplicationsList locale={locale} />);
  await screen.findByText('app-1');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApplicationsList', () => {
  it('tells a rejected customer why, in words', async () => {
    await renderList({});

    expect(screen.getByText(en['application.result.reasons'])).toBeTruthy();
    expect(screen.getByText(en['application.reason.min_age'])).toBeTruthy();
    expect(screen.queryByText('min_age')).toBeNull();
  });

  it('says when a too-young applicant can try again', async () => {
    await renderList({});
    expect(screen.getByText(/Eligible from:\s+10 March 2027/)).toBeTruthy();
  });

  it('lists every reason', async () => {
    await renderList({ reasons: ['residency', 'affordability'], eligible_from: null });

    expect(screen.getByText(en['application.reason.residency'])).toBeTruthy();
    expect(screen.getByText(en['application.reason.affordability'])).toBeTruthy();
  });

  it('speaks the language of the page', async () => {
    await renderList({}, 'fi');
    expect(screen.getByText(messages.fi['application.reason.min_age'])).toBeTruthy();
  });

  it('explains a case waiting for a person', async () => {
    await renderList({
      decision: 'manual_review',
      reasons: ['pep_manual_review'],
      eligible_from: null,
    });

    expect(screen.getByText(en['application.result.additionalInformation'])).toBeTruthy();
    expect(screen.getByText(en['application.reason.pep_manual_review'])).toBeTruthy();
  });

  it('does not promise a check that already happened when a person rejected it', async () => {
    await renderList({
      reasons: ['pep_manual_review'],
      reviewed_by: 'staff-admin',
      eligible_from: null,
    });

    expect(screen.getByText(en['application.reason.reviewedRejected'])).toBeTruthy();
    expect(screen.queryByText(en['application.reason.pep_manual_review'])).toBeNull();
  });

  it('gives no reason when a person approved it', async () => {
    await renderList({
      decision: 'approved',
      reasons: ['pep_manual_review'],
      reviewed_by: 'staff-admin',
      eligible_from: null,
    });

    expect(screen.queryByText(en['application.reason.pep_manual_review'])).toBeNull();
    expect(screen.queryByText(en['application.result.reasons'])).toBeNull();
  });

  it('shows no reasons on a plain approval', async () => {
    await renderList({ decision: 'approved', reasons: [], eligible_from: null });
    expect(screen.queryByRole('list')).toBeNull();
  });
});
