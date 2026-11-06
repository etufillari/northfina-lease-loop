'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { AuthField, authButtonClass } from './auth-field';

export function AuthForm({ mode, locale }: { mode: 'login' | 'register'; locale: Locale }) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const registering = mode === 'register';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(registering ? { name: fields.get('name') } : {}),
          email: fields.get('email'),
          password: fields.get('password'),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setError(
          result.error?.code === 'RATE_LIMITED'
            ? 'auth.rateLimited'
            : registering
              ? 'auth.registerError'
              : 'auth.loginError'
        );
        return;
      }
      form.reset();
      const next = new URLSearchParams(window.location.search).get('next');
      const destination = next === 'cart' || next === 'application' ? next : 'account';
      router.replace(`/${locale}/${destination}`);
      router.refresh();
    } catch {
      setError('auth.networkError');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" aria-busy={busy}>
      <fieldset disabled={busy} className="space-y-6">
        {registering ? (
          <AuthField name="name" label={t('auth.name')} autoComplete="name" maxLength={100} />
        ) : null}
        <AuthField
          name="email"
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          maxLength={254}
        />
        <AuthField
          name="password"
          label={t('auth.password')}
          type="password"
          autoComplete={registering ? 'new-password' : 'current-password'}
          minLength={registering ? 15 : 1}
          maxLength={128}
        />
        {registering ? (
          <p className="text-caption text-ink-muted">{t('auth.passwordHint')}</p>
        ) : null}
        <p role="alert" className="text-caption text-ink" id="auth-error">
          {error ? t(error) : ''}
        </p>
        <button type="submit" disabled={busy} className={`${authButtonClass} w-full`}>
          {t(busy ? 'auth.working' : registering ? 'auth.register' : 'auth.login')}
        </button>
      </fieldset>
      <p className="text-center text-caption text-ink-muted">
        {t(registering ? 'auth.haveAccount' : 'auth.needAccount')}{' '}
        <Link
          className="inline-flex min-h-target items-center text-primary underline underline-offset-4"
          href={`/${locale}/${registering ? 'login' : 'register'}`}
          onClick={(event) => {
            const next = new URLSearchParams(window.location.search).get('next');
            if (next === 'cart' || next === 'application') {
              event.preventDefault();
              router.push(`/${locale}/${registering ? 'login' : 'register'}?next=${next}`);
            }
          }}
        >
          {t(registering ? 'auth.login' : 'auth.register')}
        </Link>
      </p>
    </form>
  );
}
