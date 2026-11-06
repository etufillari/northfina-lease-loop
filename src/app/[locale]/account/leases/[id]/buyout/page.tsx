import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { BuyoutCheckout } from '@/components/buyout-checkout';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { leaseActionContext } from '@/server/lease-actions';
import { appToday } from '@/server/demo-mode';
import { issueDueInvoices } from '@/server/invoice-issuance';
export default async function Page({ params }: PageProps<'/[locale]/account/leases/[id]/buyout'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  const owned = await db.contract.findFirst({
    where: { id, customerId: identity.customerId },
    select: { id: true },
  });
  if (!owned) notFound();
  const today = await appToday();
  await issueDueInvoices(db, identity.customerId, today);
  const data = await leaseActionContext(db, identity.customerId, id, today);
  const t = getT(locale);
  return (
    <DashboardShell locale={locale} active="leases">
      <Link
        href={`/${locale}/account/leases/${id}`}
        className="inline-flex min-h-target items-center text-caption text-primary"
      >
        ← {t('dashboard.viewLease')}
      </Link>
      <BuyoutCheckout
        locale={locale}
        contractId={id}
        name={`${data.contract.asset.make} ${data.contract.asset.model}`}
        assetId={data.contract.assetId}
        quote={data.quote}
        finance={data.finance}
        quoteDate={today}
        active={data.contract.status === 'active'}
        paid={data.contract.status === 'bought'}
        paidTotalCents={
          data.contract.actionPayments.find((payment) => payment.kind === 'buyout')?.amountCents
        }
      />
    </DashboardShell>
  );
}
