import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetCard } from './asset-card';
import type { Asset } from '@/data/schemas';
import type { ListPriceResult } from '@/domain/price-list';
import type { Locale } from '@/i18n/locales';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} />
  ),
}));

vi.mock('@/components/ui/asset-status-badge', () => ({
  AssetStatusBadge: () => <span>Available</span>,
}));

const asset = {
  id: 'asset-1',
  category: 'farm_machine',
  make: 'Volvo',
  model: 'EC250',
  model_year: 2022,
  serial_number: 'VOL-123',
  condition: 'good',
  usage: {
    unit: 'engine_hours',
    value: 1200,
  },
  previous_lives: 1,
  status: 'available',
} satisfies Asset;

const price = {
  ok: true,
  priceCents: 249900,
  priceListVersion: 1,
} satisfies ListPriceResult;

const t = ((key: string, params?: Record<string, unknown>) => {
  const messages: Record<string, string> = {
    'condition.label': 'Condition',
    'condition.good': 'Good',
    'asset.modelYear': 'Model year',
    'asset.usage': 'Usage',
    'asset.previousLives': 'Previous lives',
    'asset.listPrice': 'List price excl. VAT',
    'asset.estimatedLeasePrice': 'Estimated lease price excl. VAT',
    'asset.month': 'month',
    'asset.noPrice': 'No price available',
    'asset.priceListVersion': `Price list ${params?.version}`,
    'asset.leaseDuration': `for ${params?.months} months`,
    'usage.hours': `${params?.value} hours`,
  };

  return messages[key] ?? key;
}) as React.ComponentProps<typeof AssetCard>['t'];

describe('AssetCard', () => {
  it('renders asset details and status', () => {
    render(
      <AssetCard asset={asset} price={price} leasePrice={21500} locale={'en' as Locale} t={t} />
    );

    expect(screen.getByRole('heading', { name: 'EC250' })).toBeInTheDocument();
    expect(screen.getByText('Volvo')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
  });

  it('renders the list price', () => {
    render(
      <AssetCard asset={asset} price={price} leasePrice={21500} locale={'en' as Locale} t={t} />
    );

    expect(screen.getByText('List price excl. VAT')).toBeInTheDocument();
    expect(screen.getByText('€2,499.00')).toBeInTheDocument();
  });

  it('renders the estimated lease price and duration', () => {
    render(
      <AssetCard asset={asset} price={price} leasePrice={21500} locale={'en' as Locale} t={t} />
    );

    expect(screen.getByText('Estimated lease price excl. VAT')).toBeInTheDocument();
    expect(screen.getByText('€215.00')).toBeInTheDocument();
    expect(screen.getByText('for 12 months')).toBeInTheDocument();
    expect(screen.getByText('/ month')).toBeInTheDocument();
  });

  it('hides the lease estimate when the list price is unavailable', () => {
    const missingPrice = {
      ok: false,
      reason: 'no_price_list_on_date',
    } satisfies ListPriceResult;

    render(
      <AssetCard
        asset={asset}
        price={missingPrice}
        leasePrice={21500}
        locale={'en' as Locale}
        t={t}
      />
    );

    expect(screen.getByText('No price available')).toBeInTheDocument();
    expect(screen.queryByText('Estimated lease price excl. VAT')).not.toBeInTheDocument();
  });
});
