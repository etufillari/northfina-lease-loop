'use client';

// Demo "acting as" control: pick a customer or staff id, POST /api/session, cookie is set.
// No password. The list comes from GET /api/session/users.

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';
import type { IdentitySummary } from '@/domain/identity';
import { getT, type Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

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

  // Fetch data without updating React state.
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

  // Initial data loading.
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

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2 dark:border-stone-800 dark:bg-stone-900">
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
        className="min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-2 py-2 text-sm text-stone-800 shadow-none outline-none ring-0 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 dark:text-stone-100"
      >
        <option
          value=""
          disabled
          className="bg-stone-50 text-stone-800 dark:bg-stone-900 dark:text-stone-100"
        >
          {loading ? t('session.loading') : t('session.guest')}
        </option>

        {customers.length > 0 && (
          <optgroup label={t('session.customers')}>
            {customers.map((user) => (
              <option
                key={user.id}
                value={user.id}
                className="bg-stone-50 text-stone-800 dark:bg-stone-900 dark:text-stone-100"
              >
                {optionLabel(user, t)}
              </option>
            ))}
          </optgroup>
        )}

        {staff.length > 0 && (
          <optgroup label={t('session.staff')}>
            {staff.map((user) => (
              <option key={user.id} value={user.id}>
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
        className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
      >
        {t('session.logout')}
      </button>

      {error && (
        <p className="px-1 text-xs text-red-700 dark:text-red-400" role="alert">
          {t('session.error')}
        </p>
      )}
    </div>
  );
}
