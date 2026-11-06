// The calculator rendered on the server (no effects run): with one allowed term the term is a
// static line and there is no range input for it; with several it is a slider.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { QuoteBreakdown } from '@/domain/pricing';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));

const { QuoteCalculator } = await import('./quote-calculator');

const quote: QuoteBreakdown = {
  assetId: 'x',
  quantity: 1,
  isoDate: '2026-11-05',
  priceListVersion: 1,
  unitListPriceCents: 389_000,
  listPriceCents: 389_000,
  downPaymentCents: 0,
  financedCents: 389_000,
  band: 'B',
  factorMillionths: 27_584,
  termMonths: 12,
  monthlyNetCents: 10_730,
  vatRateBasisPoints: 2550,
  monthlyVatCents: 2736,
  monthlyGrossCents: 13_466,
  buyoutPercentBasisPoints: 1500,
  buyoutCents: 58_350,
  downPaymentVatCents: 0,
  downPaymentGrossCents: 0,
  buyoutVatCents: 14_879,
  buyoutGrossCents: 73_229,
  totalIfReturnCents: 12 * 13_466,
  totalIfBuyCents: 12 * 13_466 + 73_229,
  vatIsEstimate: true,
};

function render(terms: number[]) {
  return renderToStaticMarkup(
    <QuoteCalculator
      assetId="x"
      locale="en"
      terms={terms}
      unitPriceCents={389_000}
      initial={{ termMonths: terms[0]!, downPaymentCents: 0 }}
      initialPreview={{
        today: '2026-11-05',
        quote: { ...quote, termMonths: terms[0]! },
        refusal: null,
        comparison: { rows: [], unavailable: [] },
      }}
      canQuote
    />
  );
}

describe('QuoteCalculator and the allowed terms (D43)', () => {
  it('shows one allowed term as a line, with no range input for the term', () => {
    const html = render([12]);
    expect(html).toContain('data-testid="term-static"');
    expect(html).not.toMatch(/type="range"[^>]*max="0"/);
  });

  it('shows several allowed terms as a slider', () => {
    const html = render([12, 24, 36]);
    expect(html).not.toContain('data-testid="term-static"');
    expect(html).toMatch(/type="range"[^>]*max="2"/);
  });
});
