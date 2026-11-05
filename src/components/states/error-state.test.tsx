import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('renders the title', () => {
    render(<ErrorState title="Unable to load asset" />);

    expect(screen.getByRole('heading', { name: 'Unable to load asset' })).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<ErrorState title="Something went wrong" description="Please try again later." />);

    expect(screen.getByText('Please try again later.')).toBeInTheDocument();
  });

  it('renders an action when provided', () => {
    render(<ErrorState title="Something went wrong" action={<button>Retry</button>} />);

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('has alert role', () => {
    render(<ErrorState title="Something went wrong" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
