import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import { UserSwitcher } from './user-switcher';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./notification-toasts', () => ({
  NotificationToasts: () => <div data-testid="notifications" />,
}));

type User = { id: string; name: string; role: string; kind: string };

const users: User[] = [
  { id: 'cust-aino', name: 'Aino', role: 'client', kind: 'customer' },
  { id: 'staff-admin', name: 'Admin', role: 'admin', kind: 'staff' },
  { id: 'staff-dealer', name: 'Dealer', role: 'dealer', kind: 'staff' },
];

const signatory: User = {
  id: 'sign-norvi-ceo',
  name: 'Anna Norvi',
  role: 'signatory',
  kind: 'signatory',
};

function stubSession(current: User | null, everyone: User[] = users) {
  const answer = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/demo-date')) return answer({ date: '2026-11-05', is_demo: false });
      return answer(url.endsWith('/users') ? everyone : current);
    })
  );
}

const reviewLink = messages.en['staff.applications.title'];
const dashboardLink = messages.en['dealer.title'];

async function renderAs(current: User | null, everyone: User[] = users) {
  stubSession(current, everyone);
  render(<UserSwitcher locale="en" />);
  await waitFor(() => expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UserSwitcher', () => {
  it('sends an admin to the manual review page', async () => {
    await renderAs(users[1] ?? null);

    expect(await screen.findByRole('link', { name: reviewLink })).toHaveAttribute(
      'href',
      '/en/admin/applications'
    );
  });

  it('sends a customer to their own applications', async () => {
    await renderAs(users[0] ?? null);

    expect(
      await screen.findByRole('link', { name: messages.en['account.applications.title'] })
    ).toHaveAttribute('href', '/en/account/applications');
  });

  it('sends a dealer to the dashboard, but not to manual review', async () => {
    await renderAs(users[2] ?? null);

    expect(await screen.findByRole('link', { name: dashboardLink })).toHaveAttribute(
      'href',
      '/en/dealer'
    );
    expect(screen.queryByRole('link', { name: reviewLink })).toBeNull();
  });

  it('gives an admin both staff links', async () => {
    await renderAs(users[1] ?? null);

    expect(await screen.findByRole('link', { name: dashboardLink })).toBeTruthy();
    expect(screen.getByRole('link', { name: reviewLink })).toBeTruthy();
  });

  it.each([1, 2])('links staff to the audit log', async (index) => {
    await renderAs(users[index] ?? null);

    expect(await screen.findByRole('link', { name: messages.en['audit.title'] })).toHaveAttribute(
      'href',
      '/en/admin/audit-log'
    );
  });

  it('sends a signatory to the applications waiting for them, and nowhere else', async () => {
    await renderAs(signatory, [...users, signatory]);

    expect(
      await screen.findByRole('link', { name: messages.en['account.applications.title'] })
    ).toHaveAttribute('href', '/en/account/applications');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it.each([
    ['a customer', 0, true],
    ['an admin', 1, true],
    ['a dealer', 2, false],
  ])('connects notifications for %s: %#', async (_who, index, expected) => {
    await renderAs(users[index] ?? null);
    await screen.findAllByRole('link');

    expect(screen.queryAllByTestId('notifications')).toHaveLength(expected ? 1 : 0);
  });

  it('connects no notifications for a signatory', async () => {
    await renderAs(signatory, [...users, signatory]);
    await screen.findAllByRole('link');

    expect(screen.queryByTestId('notifications')).toBeNull();
  });

  it('gives a customer no staff links', async () => {
    await renderAs(users[0] ?? null);

    await screen.findByRole('link', { name: messages.en['account.applications.title'] });
    expect(screen.queryByRole('link', { name: dashboardLink })).toBeNull();
    expect(screen.queryByRole('link', { name: reviewLink })).toBeNull();
  });

  it('shows no link when nobody is logged in', async () => {
    await renderAs(null);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('gives only an admin the demo date control', async () => {
    const setDate = messages.en['admin.demoDate.apply'];

    await renderAs(users[1] ?? null);
    expect(await screen.findByRole('button', { name: setDate })).toBeTruthy();
    cleanup();

    await renderAs(users[2] ?? null);
    expect(screen.queryByRole('button', { name: setDate })).toBeNull();
    cleanup();

    await renderAs(users[0] ?? null);
    expect(screen.queryByRole('button', { name: setDate })).toBeNull();
  });
});
