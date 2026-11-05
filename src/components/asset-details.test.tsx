import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Asset } from '@/data/schemas';
import type { Locale } from '@/i18n/locales';
import type { Translate } from '@/i18n/get-t';

import { AssetDetails } from './asset-details';
import { categoryFallbackImages } from '@/data/asset-images';
import { formatEuro } from '@/domain/money';
import { intlLocale } from '@/i18n/locales';

vi.mock('next/image', () => ({
  default: 'img',
}));

const asset = {
  id: 'asset-001',
  category: Object.keys(categoryFallbackImages)[0],
  make: 'Specialized',
  model: 'Turbo Vado',
  model_year: 2024,
  serial_number: 'SN-12345',
  condition: 'good',
  usage: {
    value: 1200,
    unit: 'km',
  },
  previous_lives: 1,
  status: 'available',
} as Asset;

const locale: Locale = 'en';

const translations: Record<string, string> = {
  'asset.listPrice': 'List price',
  'condition.label': 'Condition',
  'condition.good': 'Good',
  'asset.modelYear': 'Model year',
  'asset.usage': 'Usage',
  'usage.km': '1200 km',
  'asset.previousLives': 'Previous owners',
  'status.available': 'Available',
};

const t = ((key: string) => translations[key] ?? key) as Translate;

describe('AssetDetails', () => {
  it('renders the asset make and model', () => {
    render(<AssetDetails asset={asset} locale={locale} t={t} unitPriceCents={null} />);

    expect(screen.getByText('Specialized')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Turbo Vado' })).toBeInTheDocument();
  });

  it('renders the fallback image for the asset category', () => {
    render(<AssetDetails asset={asset} locale={locale} t={t} unitPriceCents={null} />);

    const image = screen.getByRole('img');

    expect(image).toHaveAttribute('src', categoryFallbackImages[asset.category]);
    expect(image).toHaveAttribute('alt', '');
  });

  it('renders the formatted list price when provided', () => {
    const unitPriceCents = 189900;

    render(<AssetDetails asset={asset} locale={locale} t={t} unitPriceCents={unitPriceCents} />);

    expect(screen.getByText('List price')).toBeInTheDocument();
    expect(screen.getByText(formatEuro(unitPriceCents, intlLocale[locale]))).toBeInTheDocument();
  });

  it('does not render the list price when it is null', () => {
    render(<AssetDetails asset={asset} locale={locale} t={t} unitPriceCents={null} />);

    expect(screen.queryByText('List price')).not.toBeInTheDocument();
  });

  it('renders the asset specifications', () => {
    render(<AssetDetails asset={asset} locale={locale} t={t} unitPriceCents={null} />);

    expect(screen.getByText('Condition')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();

    expect(screen.getByText('Model year')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();

    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('1200 km')).toBeInTheDocument();

    expect(screen.getByText('Previous owners')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders the asset status badge', () => {
    render(<AssetDetails asset={asset} locale={locale} t={t} unitPriceCents={null} />);

    expect(screen.getByText('Available')).toBeInTheDocument();
  });
});
