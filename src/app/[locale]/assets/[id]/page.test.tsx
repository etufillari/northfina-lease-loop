import { act, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import AssetDetailsPage from './page';

vi.mock('@/components/asset-details', () => ({
  AssetDetails: ({ asset }: { asset: { model: string } }) => <h1>{asset.model}</h1>,
}));
vi.mock('@/components/asset-quote-panel', () => ({ AssetQuotePanel: () => null }));

const en = messages.en;

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderPage(locale = 'en', id = 'ebike-003') {
  await act(async () => {
    render(
      <Suspense>
        <AssetDetailsPage params={Promise.resolve({ locale, id })} />
      </Suspense>
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssetDetailsPage', () => {
  it('asks for this one item, not the whole catalogue', async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ success: true, data: { id: 'ebike-003', model: 'Trail 500' } }))
    );

    await renderPage();

    expect(await screen.findByRole('heading', { name: 'Trail 500' })).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/assets/ebike-003');
  });

  it('says so when the item does not exist', async () => {
    stubFetch(
      new Response('{"success":false,"error":{"code":"ASSET_NOT_FOUND"}}', { status: 404 })
    );

    await renderPage();

    expect(await screen.findByText(en['asset.notFound'])).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error, not "not found", when loading fails', async () => {
    stubFetch(new Response('{"success":false}', { status: 500 }));

    await renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(en['asset.loadError']);
  });

  it('uses the language of the page', async () => {
    stubFetch(new Response('{}', { status: 404 }));

    await renderPage('fi');

    expect(await screen.findByText(messages.fi['asset.notFound'])).toBeTruthy();
  });
});
