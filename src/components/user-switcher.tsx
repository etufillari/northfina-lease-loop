'use client';

// Demo "acting as" control: pick a customer or staff id, POST /api/session, cookie is set.
// No password. The list comes from GET /api/session/users.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';

import { can, type IdentitySummary } from '@/domain/identity';
import { getT, type Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

import { DemoDateControl } from './demo-date-control';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { message: string };
};

type SessionData = {
  users: IdentitySummary[];
  currentId: string;
};

async function readSessionApi<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !body.success) {
    throw new Error(body.error?.message ?? 'session request failed');
  }

  return body.data as T;
}

function roleLabel(role: IdentitySummary['role'], t: Translate): string {
  if (role === 'dealer') return t('session.role.dealer');
  if (role === 'admin') return t('session.role.admin');
  if (role === 'signatory') return t('session.role.signatory');
  return t('session.role.client');
}

function optionLabel(user: IdentitySummary, t: Translate): string {
  return `${user.name} · ${roleLabel(user.role, t)}`;
}

export function UserSwitcher({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const router = useRouter();
  const selectId = useId();

  const [users, setUsers] = useState<IdentitySummary[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (): Promise<SessionData> => {
    const [usersResponse, sessionResponse] = await Promise.all([
      fetch('/api/session/users'),
      fetch('/api/session'),
    ]);

    const list = await readSessionApi<IdentitySummary[]>(usersResponse);
    const current = await readSessionApi<IdentitySummary | null>(sessionResponse);

    return {
      users: list,
      currentId: current?.id ?? '',
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    load()
      .then((data) => {
        if (cancelled) return;

        setUsers(data.users);
        setCurrentId(data.currentId);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  async function onChange(userId: string) {
    setBusy(true);
    setError(false);

    try {
      if (userId === '') {
        const response = await fetch('/api/session', {
          method: 'DELETE',
        });

        await readSessionApi<null>(response);
        setCurrentId('');
      } else {
        const response = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });

        const signedIn = await readSessionApi<IdentitySummary>(response);
        setCurrentId(signedIn.id);
      }

      router.refresh();
      window.location.reload();
    } catch {
      setError(true);

      try {
        const data = await load();
        setUsers(data.users);
        setCurrentId(data.currentId);
      } catch {
        // Keep the current state if reloading also fails.
      }
    } finally {
      setBusy(false);
    }
  }

  const customers = users.filter((user) => user.kind === 'customer');
  const staff = users.filter((user) => user.kind !== 'customer');

  const currentUser = users.find((user) => user.id === currentId);

  const links: { href: string; label: string }[] = [];
  if (currentUser?.kind === 'customer') {
    links.push({
      href: `/${locale}/account/applications`,
      label: t('account.applications.title'),
    });
  }
  if (currentUser && can(currentUser.role, 'application.decide_manual_review')) {
    links.push({ href: `/${locale}/admin/applications`, label: t('staff.applications.title') });
  }
  if (currentUser && can(currentUser.role, 'second_life.refurbish')) {
    links.push({ href: `/${locale}/dealer`, label: t('dealer.title') });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {currentUser?.role === 'admin' && <DemoDateControl locale={locale} />}

      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="shrink-0 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-900/60 hover:text-emerald-200"
        >
          {label}
        </Link>
      ))}

      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-stone-800 bg-stone-900 p-2">
        <label htmlFor={selectId} className="sr-only">
          {t('nav.session')}
        </label>

        <select
          id={selectId}
          value={currentId}
          disabled={loading || busy || users.length === 0}
          onChange={(event) => void onChange(event.target.value)}
          aria-busy={loading || busy}
          aria-invalid={error || undefined}
          className="min-w-0 flex-1 appearance-none border-0 bg-transparent [color-scheme:dark] px-2 py-2 text-sm text-stone-100 shadow-none outline-none ring-0 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0"
        >
          <option value="" disabled className="bg-stone-900 text-stone-100">
            {loading ? t('session.loading') : t('session.guest')}
          </option>

          {customers.length > 0 && (
            <optgroup label={t('session.customers')} className="bg-stone-900 text-stone-400">
              {customers.map((user) => (
                <option key={user.id} value={user.id} className="bg-stone-900 text-stone-100">
                  {optionLabel(user, t)}
                </option>
              ))}
            </optgroup>
          )}

          {staff.length > 0 && (
            <optgroup label={t('session.staff')} className="bg-stone-900 text-stone-400">
              {staff.map((user) => (
                <option key={user.id} value={user.id} className="bg-stone-900 text-stone-100">
                  {optionLabel(user, t)}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <button
          type="button"
          onClick={() => void onChange('')}
          disabled={loading || busy || !currentId}
          className="shrink-0 rounded-lg border border-stone-700 px-3 py-2 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('session.logout')}
        </button>
      </div>

      {error && (
        <p className="px-1 text-xs text-red-400" role="alert">
          {t('session.error')}
        </p>
      )}
    </div>
  );
}
