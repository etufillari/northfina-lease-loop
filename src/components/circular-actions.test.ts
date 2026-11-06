import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CircularActions } from './circular-actions';

const common = {
  assetId: 'ebike-003',
  leaseId: 'lease-aino-1',
  receivedOn: '2029-11-05',
  currentDate: '2029-11-06',
  condition: 'good',
  usage: 18400,
  usageUnit: 'km',
  moneyLocale: 'en-IE',
  grades: { good: 'Good' },
  workNames: {},
  labels: {
    receive: 'Register physical return',
    confirmReceipt: 'Confirm physical receipt',
    inspect: 'Save inspection',
    finish: 'Save completed refurbishment',
    approve: 'Approve and publish offer',
    reject: 'Reject proposal',
    rejectReason: 'Reason for rejection',
    pendingApproval: 'Waiting for company approval.',
    rejected: 'Proposal rejected.',
    condition: 'Condition',
    usage: 'Usage',
    confirm: 'Confirm work',
    busy: 'Working…',
    error: 'Action failed.',
    conflict: 'Reload and retry.',
  },
};

describe('company return actions', () => {
  it('lets company operations confirm a customer-submitted physical return', () => {
    const markup = renderToStaticMarkup(
      createElement(CircularActions, {
        ...common,
        receipt: {
          id: 'return-1',
          status: 'REQUESTED',
          planJson: null,
          receivedOn: null,
          requestedOn: '2029-11-05',
          reviewReason: null,
          offerNetCents: null,
        },
      })
    );

    expect(markup).toContain('Confirm physical receipt');
  });

  it('shows approval and rejection controls after mandatory work is complete', () => {
    const markup = renderToStaticMarkup(
      createElement(CircularActions, {
        ...common,
        receipt: {
          id: 'return-1',
          status: 'PENDING_APPROVAL',
          planJson: null,
          receivedOn: '2029-11-06',
          requestedOn: '2029-11-05',
          reviewReason: null,
          offerNetCents: 50000,
        },
      })
    );

    expect(markup).toContain('Approve and publish offer');
    expect(markup).toContain('Reject proposal');
    expect(markup).toContain('Waiting for company approval.');
  });
});
