import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getT } from '@/i18n/get-t';
import { ApplyForLeasingCta } from '@/components/apply-for-leasing-cta';

describe('ApplyForLeasingCta', () => {
  it('shows no link while disabled', () => {
    render(
      <ApplyForLeasingCta
        assetId="asset-123"
        termMonths={24}
        downPaymentCents={5000}
        disabled
        locale="en"
        t={getT('en')}
      />
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Apply for leasing').getAttribute('aria-disabled')).toBe('true');
  });

  it('renders the application CTA and carries the chosen deal to the application', () => {
    render(
      <ApplyForLeasingCta
        assetId="asset-123"
        termMonths={24}
        downPaymentCents={5000}
        locale="en"
        t={getT('en')}
      />
    );

    expect(screen.getByRole('heading', { name: 'Ready to lease this asset?' })).toBeTruthy();

    expect(
      screen.getByText(
        "Submit a leasing application and we'll get in touch with you about the next steps."
      )
    ).toBeTruthy();

    const link = screen.getByRole('link', { name: 'Apply for leasing' });

    expect(link.getAttribute('href')).toBe('/en/assets/asset-123/apply?term=24&down=5000');
  });
});
