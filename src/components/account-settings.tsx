'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { AuthField, authButtonClass } from './auth-field';

export function AccountSettings({ locale, name }: { locale: Locale; name: string }) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);

  async function mutate(operation: string, body: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/auth/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.replace(`/${locale}/login`);
        router.refresh();
        return false;
      }
      if (!response.ok || !result.success) {
        setMessage(
          result.error?.code === 'RATE_LIMITED' ? 'auth.rateLimited' : 'account.updateError'
        );
        return false;
      }
      if (operation === 'logout' || operation === 'logout-all') router.replace(`/${locale}/login`);
      else setMessage('account.saved');
      router.refresh();
      return true;
    } catch {
      setMessage('auth.networkError');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function update(event: FormEvent<HTMLFormElement>, operation: 'profile' | 'password') {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body =
      operation === 'profile'
        ? { name: data.get('name') }
        : {
            currentPassword: data.get('currentPassword'),
            newPassword: data.get('newPassword'),
          };
    if ((await mutate(operation, body)) && operation === 'password') form.reset();
  }

  return (
    <div aria-busy={busy} className="mt-8 space-y-8">
      <p role="status" aria-live="polite" className="text-caption">
        {message ? t(message) : ''}
      </p>
      <section
        aria-labelledby="profile-heading"
        className="rounded-lg border border-hairline bg-canvas p-card"
      >
        <h2 id="profile-heading" className="mb-6 text-tagline font-semibold">
          {t('account.profile')}
        </h2>
        <form onSubmit={(event) => update(event, 'profile')}>
          <fieldset disabled={busy} className="space-y-6">
            <AuthField
              name="name"
              label={t('auth.name')}
              autoComplete="name"
              defaultValue={name}
              maxLength={100}
            />
            <button disabled={busy} className={authButtonClass}>
              {t('account.save')}
            </button>
          </fieldset>
        </form>
      </section>
      <section
        aria-labelledby="security-heading"
        className="rounded-lg border border-hairline bg-canvas p-card"
      >
        <h2 id="security-heading" className="mb-6 text-tagline font-semibold">
          {t('account.security')}
        </h2>
        <form onSubmit={(event) => update(event, 'password')}>
          <fieldset disabled={busy} className="space-y-6">
            <AuthField
              name="currentPassword"
              label={t('account.currentPassword')}
              type="password"
              autoComplete="current-password"
              maxLength={128}
            />
            <AuthField
              name="newPassword"
              label={t('account.newPassword')}
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
            />
            <p className="text-caption text-ink-muted">{t('auth.passwordHint')}</p>
            <p className="text-caption text-ink-muted">{t('account.passwordNote')}</p>
            <button disabled={busy} className={authButtonClass}>
              {t('account.changePassword')}
            </button>
          </fieldset>
        </form>
        <div className="mt-8 flex flex-wrap gap-3 border-t border-divider pt-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void mutate('logout', {});
            }}
            className={authButtonClass}
          >
            {t('account.logout')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void mutate('logout-all', {});
            }}
            className="pressable min-h-target rounded-pill border border-primary px-6 py-3 text-body text-primary disabled:cursor-wait disabled:opacity-60"
          >
            {t('account.logoutAll')}
          </button>
        </div>
      </section>
    </div>
  );
}
