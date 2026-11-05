// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssetStatusBadge } from './asset-status-badge';
import type { AssetStatus } from '@/data/schemas';
import type { Translate } from '@/i18n/get-t';

const translations: Record<string, string> = {
  'status.label': 'Status',
  'status.available': 'Available',
  'status.reserved': 'Reserved',
  'status.returned': 'Returned',
};

const mockTranslate = vi.fn((key: string) => translations[key] ?? key);

const statuses: {
  status: AssetStatus;
  label: string;
  variantClass: string;
}[] = [
  {
    status: 'available',
    label: 'Available',
    variantClass: 'bg-emerald-50',
  },
  {
    status: 'reserved',
    label: 'Reserved',
    variantClass: 'bg-amber-50',
  },
  {
    status: 'returned',
    label: 'Returned',
    variantClass: 'bg-sky-50',
  },
];

describe('AssetStatusBadge', () => {
  it.each(statuses)(
    'renders $status with the correct label and variant',
    ({ status, label, variantClass }) => {
      render(<AssetStatusBadge status={status} t={mockTranslate as unknown as Translate} />);

      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByText(label).className).toContain(variantClass);
    }
  );

  it('renders the accessible status label', () => {
    render(<AssetStatusBadge status="available" t={mockTranslate as unknown as Translate} />);

    expect(screen.getByText('Status:')).toBeTruthy();
  });

  it('renders a status indicator dot', () => {
    const { container } = render(
      <AssetStatusBadge status="available" t={mockTranslate as unknown as Translate} />
    );

    const dot = container.querySelector('[aria-hidden="true"]');

    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('rounded-full');
  });

  it('requests the correct translation keys', () => {
    mockTranslate.mockClear();

    render(<AssetStatusBadge status="reserved" t={mockTranslate as unknown as Translate} />);

    expect(mockTranslate).toHaveBeenCalledWith('status.label');
    expect(mockTranslate).toHaveBeenCalledWith('status.reserved');
  });
});
