// One customer's portal (D75), the same component as My leases with the customer fixed: for the
// admin, opened from the customer list on All leases. The customer themself may open it too
// (D26: the customer and admin); anyone else is told it is not theirs, nobody chosen is asked
// to choose in "Continue as". Read-only.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Notice, PageHeader } from '@/components/ui';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { ADMIN_ACTOR, ANONYMOUS_ACTOR, readActor } from '@/server/actor';
import { authorize } from '@/server/authorize';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { CustomerPortal } from '../../leases/portal';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/customers/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('portal.customer.title') }) };
}

export default async function CustomerPage({ params }: PageProps<'/[locale]/customers/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);

  const actor = await readActor(db);
  // D73: authorized before the customer's record is read. Anonymous is refused before the id
  // is even looked up; another customer is refused whatever the id.
  const auth =
    actor === ANONYMOUS_ACTOR || actor === ADMIN_ACTOR || actor === id
      ? await authorize(db, actor, 'read_leases', { customer: id })
      : null;
  const [customer, today] = auth?.ok
    ? await Promise.all([getCustomer(db, id), todayForRequest()])
    : [null, ''];
  const refusal =
    actor === ANONYMOUS_ACTOR
      ? t('leases.chooseActor')
      : !auth || (!auth.ok && auth.reason.code !== 'not_found')
        ? t('portal.customer.notAllowed')
        : !customer
          ? t('portal.customer.notFound')
          : null;
  if (refusal || !customer) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title={t('portal.customer.title')} />
        <Notice tone={actor === ANONYMOUS_ACTOR ? 'info' : 'warning'}>{refusal}</Notice>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={customer.name} intro={t('portal.customer.intro')} />
      <CustomerPortal customerId={customer.id} today={today} locale={locale} t={t} />
    </div>
  );
}
