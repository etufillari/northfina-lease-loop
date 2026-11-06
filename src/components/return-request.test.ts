import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ReturnRequest } from './return-request';

describe('customer return request', () => {
  it('lets a customer submit the cumulative reading in the asset unit', () => {
    const markup = renderToStaticMarkup(
      createElement(ReturnRequest, {
        leaseId: 'lease-aino-1',
        usageValue: 1200,
        usageUnit: 'km',
        status: null,
        labels: {
          title: 'Request return',
          usage: 'Current odometer',
          submit: 'Submit return request',
          pending: 'Thank you for using our service. We will send return information soon.',
          processing: 'Your return is being processed.',
          ready: 'Your item is approved.',
          rejected: 'Please contact the company.',
          error: 'Could not submit return.',
          busy: 'Submitting…',
          unit: 'km',
        },
      })
    );

    expect(markup).toContain('Current odometer');
    expect(markup).toContain('km');
    expect(markup).toContain('Submit return request');
  });

  it('shows the thank-you state after a request has been submitted', () => {
    const markup = renderToStaticMarkup(
      createElement(ReturnRequest, {
        leaseId: 'lease-aino-1',
        usageValue: 1200,
        usageUnit: 'km',
        status: 'REQUESTED',
        labels: {
          title: 'Request return',
          usage: 'Current odometer',
          submit: 'Submit return request',
          pending: 'Thank you for using our service. We will send return information soon.',
          processing: 'Your return is being processed.',
          ready: 'Your item is approved.',
          rejected: 'Please contact the company.',
          error: 'Could not submit return.',
          busy: 'Submitting…',
          unit: 'km',
        },
      })
    );

    expect(markup).toContain('Thank you for using our service');
    expect(markup).not.toContain('Submit return request');
  });
});
