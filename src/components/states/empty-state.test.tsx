import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="Asset not found" />);

    expect(screen.getByRole('heading', { name: 'Asset not found' })).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="No assets" description="There are no assets available." />);

    expect(screen.getByText('There are no assets available.')).toBeInTheDocument();
  });

  it('renders an action when provided', () => {
    render(<EmptyState title="No assets" action={<button>Back to catalogue</button>} />);

    expect(screen.getByRole('button', { name: 'Back to catalogue' })).toBeInTheDocument();
  });

  it('does not render description or action when omitted', () => {
    render(<EmptyState title="No assets" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No assets' })).toBeInTheDocument();
  });
});
