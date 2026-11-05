import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getT } from '@/i18n/get-t';
import { ApplyForLeasingCta } from '@/components/apply-for-leasing-cta';

describe('ApplyForLeasingCta', () => {
  it('renders the application CTA and links to the asset application page', () => {
    render(<ApplyForLeasingCta assetId="asset-123" locale="en" t={getT('en')} />);

    expect(screen.getByRole('heading', { name: 'Ready to lease this asset?' })).toBeTruthy();

    expect(
      screen.getByText(
        "Submit a leasing application and we'll get in touch with you about the next steps."
      )
    ).toBeTruthy();

    const link = screen.getByRole('link', { name: 'Apply for leasing' });

    expect(link.getAttribute('href')).toBe('/en/assets/asset-123/apply');
  });
});
