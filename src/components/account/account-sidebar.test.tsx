import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import AccountSidebar from './account-sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/en/account/applications' }));

describe('AccountSidebar', () => {
  it('gives a customer every section', () => {
    render(<AccountSidebar locale="en" />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('gives a signatory only the applications', () => {
    render(<AccountSidebar locale="en" applicationsOnly />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(
      screen.getByRole('link', { name: messages.en['account.applications.title'] })
    ).toBeTruthy();
  });
});
