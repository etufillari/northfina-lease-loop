import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@/i18n/locales';
import type { Translate } from '@/i18n/get-t';

import { formatEuro } from '@/domain/money';
import { intlLocale } from '@/i18n/locales';

import { AssetQuotePanel } from './asset-quote-panel';

const locale: Locale = 'en';

const translations: Record<string, string> = {
  'asset.estimatedLeasePrice': 'Estimated lease price',
  'asset.leaseTerm': 'Lease term',
  'asset.month': 'month',
  'asset.quantity': 'Quantity',
  'asset.downPayment': 'Down payment',
  'asset.updatingQuote': 'Updating quote...',
  'asset.monthlyPaymentIncludingVat': 'Monthly payment including VAT',
  'asset.netMonthlyRent': 'Net monthly rent',
  'asset.vat': 'VAT',
  'asset.unitListPrice': 'Unit list price',
  'asset.totalFinanced': 'Total financed',
  'asset.buyout': 'Buyout',
  'asset.totalIfReturned': 'Total if returned',
  'asset.totalIfBought': 'Total if bought',
  'asset.quoteDate': 'Quote date',
  'asset.quoteUnavailable': 'Unable to calculate quote.',
  'asset.unavailableForLeasing': 'This asset is currently unavailable for leasing.',
  'asset.readyToLease': 'Ready to lease this asset?',
  'asset.leaseApplicationDescription':
    "Submit a leasing application and we'll get in touch with you about the next steps.",
  'asset.applyForLeasing': 'Apply for leasing',
};

const t = ((key: string) => translations[key] ?? key) as Translate;

const quote = {
  unit_price_cents: 189900,
  quote_date: '2026-11-06',
  vat_rate_percent: 25.5,
  monthly_vat_cents: 2550,
  monthly_total_cents: 12550,
  monthly_net_rent_cents: 10000,
  financed_cents: 189900,
  buyout_cents: 18990,
  total_if_returned_cents: 360000,
  total_if_bought_cents: 378990,
  down_payment_limits: {
    min_cents: 5000,
    max_cents: 50000,
  },
};

const successResponse = {
  success: true,
  data: quote,
  meta: {
    timestamp: '2026-11-06T10:00:00.000Z',
  },
};

function mockFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(body),
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

async function flushDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}

function renderPanel(
  props: Partial<{
    assetId: string;
    available: boolean;
    onUnitPriceChange: (cents: number | null) => void;
  }> = {}
) {
  const onUnitPriceChange = props.onUnitPriceChange ?? vi.fn();

  const result = render(
    <AssetQuotePanel
      assetId={props.assetId ?? 'asset-001'}
      available={props.available ?? true}
      locale={locale}
      t={t}
      onUnitPriceChange={onUnitPriceChange}
    />
  );

  return {
    ...result,
    onUnitPriceChange,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AssetQuotePanel', () => {
  it('renders the quote panel heading and inputs', () => {
    mockFetch(successResponse);

    renderPanel();

    expect(screen.getByRole('heading', { name: 'Estimated lease price' })).toBeInTheDocument();

    expect(screen.getByLabelText('Lease term')).toHaveValue('36');
    expect(screen.getByLabelText('Quantity')).toHaveValue(1);
    expect(screen.getByLabelText('Down payment')).toBeInTheDocument();
  });

  it('fetches and displays the initial quote', async () => {
    const fetchMock = mockFetch(successResponse);
    const { onUnitPriceChange } = renderPanel();

    await flushDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/assets/asset-001/quote?term=36&down=0&quantity=1',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );

    expect(
      screen.getByText(formatEuro(quote.monthly_total_cents, intlLocale[locale]))
    ).toBeInTheDocument();

    expect(screen.getByText('Net monthly rent')).toBeInTheDocument();
    expect(screen.getByText('VAT (25.5%)')).toBeInTheDocument();
    expect(screen.getByText('Unit list price')).toBeInTheDocument();
    expect(screen.getByText('Total financed')).toBeInTheDocument();
    expect(screen.getByText('Buyout')).toBeInTheDocument();
    expect(screen.getByText('Total if returned')).toBeInTheDocument();
    expect(screen.getByText('Total if bought')).toBeInTheDocument();
    expect(screen.getByText('Quote date: 2026-11-06')).toBeInTheDocument();

    expect(onUnitPriceChange).toHaveBeenCalledWith(189900);
  });

  it('requests a new quote when the lease term changes', async () => {
    const fetchMock = mockFetch(successResponse);

    renderPanel();

    await flushDebounce();

    fireEvent.change(screen.getByLabelText('Lease term'), {
      target: { value: '48' },
    });

    await flushDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/assets/asset-001/quote?term=48&down=0&quantity=1',
      expect.any(Object)
    );
  });

  it('requests a new quote when the quantity changes', async () => {
    const fetchMock = mockFetch(successResponse);

    renderPanel();

    await flushDebounce();

    fireEvent.change(screen.getByLabelText('Quantity'), {
      target: { value: '3' },
    });

    await flushDebounce();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/assets/asset-001/quote?term=36&down=0&quantity=3',
      expect.any(Object)
    );
  });

  it('requests a new quote when the down payment changes', async () => {
    const fetchMock = mockFetch(successResponse);

    renderPanel();

    await flushDebounce();

    fireEvent.change(screen.getByLabelText('Down payment'), {
      target: { value: '10000' },
    });

    await flushDebounce();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/assets/asset-001/quote?term=36&down=10000&quantity=1',
      expect.any(Object)
    );
  });

  it('displays an API error', async () => {
    mockFetch(
      {
        success: false,
        error: {
          code: 'QUOTE_NOT_AVAILABLE',
          message: 'Quote is not available for this asset.',
        },
      },
      false
    );

    renderPanel();

    await flushDebounce();

    expect(screen.getByText('Quote is not available for this asset.')).toBeInTheDocument();
  });

  it('displays a fallback error when the request fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));

    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    await flushDebounce();

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('automatically adjusts down payment when it is below the minimum', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({
          success: false,
          error: {
            code: 'QUOTE_NOT_AVAILABLE',
            message: 'Down payment is below the minimum.',
            details: {
              reason: 'below_minimum',
              down_payment_limits: {
                min_cents: 5000,
                max_cents: 50000,
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(successResponse),
      });

    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    await flushDebounce();
    await flushDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/assets/asset-001/quote?term=36&down=5000&quantity=1',
      expect.any(Object)
    );

    expect(
      screen.getByText(formatEuro(quote.monthly_total_cents, intlLocale[locale]))
    ).toBeInTheDocument();
  });

  it('shows unavailable message when the asset cannot be leased', () => {
    const fetchMock = mockFetch(successResponse);
    const { onUnitPriceChange } = renderPanel({
      available: false,
    });

    expect(
      screen.getByText('This asset is currently unavailable for leasing.')
    ).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUnitPriceChange).toHaveBeenCalledWith(null);

    expect(screen.queryByRole('link', { name: 'Apply for leasing' })).not.toBeInTheDocument();
  });

  it('clears the unit price when quote fetching fails', async () => {
    mockFetch(
      {
        success: false,
        error: {
          code: 'QUOTE_NOT_AVAILABLE',
          message: 'Quote unavailable.',
        },
      },
      false
    );

    const { onUnitPriceChange } = renderPanel();

    await flushDebounce();

    expect(onUnitPriceChange).toHaveBeenCalledWith(null);
  });

  it('displays the leasing application CTA when a quote is available', async () => {
    mockFetch(successResponse);

    renderPanel();

    await flushDebounce();

    expect(
      screen.getByRole('heading', {
        name: 'Ready to lease this asset?',
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Submit a leasing application and we'll get in touch with you about the next steps."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Apply for leasing' })).toHaveAttribute(
      'href',
      '/en/assets/asset-001/apply'
    );
  });

  it('does not display the leasing application CTA when quote fetching fails', async () => {
    mockFetch(
      {
        success: false,
        error: {
          code: 'QUOTE_NOT_AVAILABLE',
          message: 'Quote is not available for this asset.',
        },
      },
      false
    );

    renderPanel();

    await flushDebounce();

    expect(screen.queryByRole('link', { name: 'Apply for leasing' })).not.toBeInTheDocument();
  });
});
