// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Available</Badge>);

    expect(screen.getByText('Available')).toBeTruthy();
  });

  it.each([
    ['success', 'bg-emerald-50'],
    ['warning', 'bg-amber-50'],
    ['info', 'bg-sky-50'],
    ['neutral', 'bg-stone-100'],
  ] as const)('applies the %s variant', (variant, expectedClass) => {
    render(<Badge variant={variant}>Status</Badge>);

    const badge = screen.getByText('Status');

    expect(badge.className).toContain(expectedClass);
  });

  it('uses neutral variant by default', () => {
    render(<Badge>Status</Badge>);

    expect(screen.getByText('Status').className).toContain('bg-stone-100');
  });

  it('does not render a dot by default', () => {
    const { container } = render(<Badge>Status</Badge>);

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('renders a dot when dot is enabled', () => {
    const { container } = render(<Badge dot>Status</Badge>);

    const dot = container.querySelector('[aria-hidden="true"]');

    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('rounded-full');
  });

  it('supports custom class names', () => {
    render(<Badge className="my-custom-class">Status</Badge>);

    expect(screen.getByText('Status').className).toContain('my-custom-class');
  });

  it('forwards HTML attributes', () => {
    render(<Badge title="Asset availability">Available</Badge>);

    expect(screen.getByTitle('Asset availability')).toBeTruthy();
  });
});
