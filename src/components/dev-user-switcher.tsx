'use client';

import { useState } from 'react';
import { ACTIVE_USER_COOKIE, type ActiveUserOption } from '@/active-user';
import type { CustomerType } from '@/active-user';

type DevUserSwitcherProps = {
  users: readonly ActiveUserOption[];
  activeUserId: string | null;
  buttonLabel: string;
  label: string;
  resetLabel: string;
  customerTypeLabels: Record<CustomerType, string>;
};

export function DevUserSwitcher({
  users,
  activeUserId,
  buttonLabel,
  label,
  resetLabel,
  customerTypeLabels,
}: DevUserSwitcherProps) {
  const [isOpen, setIsOpen] = useState(activeUserId !== null);

  function selectUser(userId: string) {
    if (userId) {
      document.cookie = `${ACTIVE_USER_COOKIE}=${encodeURIComponent(userId)}; path=/; SameSite=Lax`;
    } else {
      document.cookie = `${ACTIVE_USER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
    window.location.reload();
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="h-full min-h-10 w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        {buttonLabel}
      </button>
    );
  }

  return (
    <div className="flex min-h-10 w-full min-w-0 flex-col justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
      <label htmlFor="dev-active-user" className="truncate text-xs font-semibold">
        {label}
      </label>
      <select
        id="dev-active-user"
        value={activeUserId ?? ''}
        onChange={(event) => selectUser(event.target.value)}
        className="min-w-0 w-full rounded-md border border-emerald-400 bg-white px-1 py-1 text-xs text-emerald-950 focus:outline-2 focus:outline-offset-2 focus:outline-emerald-600 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-50"
      >
        <option value="">{resetLabel}</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({customerTypeLabels[user.type]})
          </option>
        ))}
      </select>
    </div>
  );
}
