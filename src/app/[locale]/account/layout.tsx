import { notFound } from 'next/navigation';

import AccountSidebar from '@/components/account/account-sidebar';
import { isLocale } from '@/i18n/locales';
import { getActor } from '@/server/auth/actor';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AccountLayout({ children, params }: LayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) notFound();

  const actor = await getActor();

  return (
    <main className="min-h-screen bg-stone-950">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <AccountSidebar locale={locale} applicationsOnly={actor?.kind === 'signatory'} />

        <div className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-12">{children}</div>
      </div>
    </main>
  );
}
