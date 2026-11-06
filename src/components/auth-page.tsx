import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { AuthForm } from './auth-form';

export async function AuthPage({ locale, mode }: { locale: string; mode: 'login' | 'register' }) {
  if (!isLocale(locale)) notFound();
  if (await readIdentity(db, await headers())) redirect(`/${locale}/account`);
  const t = getT(locale);
  return (
    <div className="bg-parchment px-card py-section-compact text-ink tablet:py-section">
      <div className="mx-auto max-w-lg rounded-lg border border-hairline bg-canvas p-card tablet:p-12">
        <h1 className="font-display text-display-sm font-semibold">
          {t(mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}
        </h1>
        <p className="mt-4 mb-8 text-body text-ink-muted">{t('auth.intro')}</p>
        <AuthForm mode={mode} locale={locale} />
      </div>
      <p className="mt-6 text-center">
        <Link
          href={`/${locale}`}
          className="inline-flex min-h-target items-center text-caption text-primary"
        >
          {t('auth.backToCatalogue')}
        </Link>
      </p>
    </div>
  );
}
