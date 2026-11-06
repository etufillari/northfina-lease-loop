import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ApplicationForm } from '@/components/application-form';
import { loadCustomers, loadQuestions } from '@/data/load';
import { personaAnswers } from '@/domain/demo';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { checkoutOptions } from '@/server/checkout-options';
import { db } from '@/server/db';
import { appToday, demoModeEnabled } from '@/server/demo-mode';

export default async function Page({ params }: PageProps<'/[locale]/application'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login?next=application`);
  const [data, bank, customers] = await Promise.all([
    checkoutOptions(await appToday()),
    loadQuestions(),
    demoModeEnabled() ? loadCustomers() : [],
  ]);
  // Demo personas start with the answers their data-pack record can give; all stay editable.
  const persona = customers.find((customer) => customer.id === identity.customerId);
  return (
    <ApplicationForm
      locale={locale}
      data={data}
      bank={bank}
      name={identity.name}
      email={identity.email}
      initialAnswers={persona ? personaAnswers(persona) : undefined}
    />
  );
}
