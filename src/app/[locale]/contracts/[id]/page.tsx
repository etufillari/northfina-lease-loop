// A signed contract: the summary with the frozen price and, when today's price list is another
// version, why the price holds (card 2), then the invoices with the VAT-change line (card 3).
// Only the contract's customer or admin sees it, authorized first (D17, D73). Opened from My
// leases (`?from=leases`), it offers the way back there above the title and at the end.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ContractExit } from '@/components/contract-exit';
import { ContractSummary } from '@/components/contract-summary';
import { InvoiceTable } from '@/components/invoice-table';
import Link from 'next/link';
import { Card, LinkButton, Notice, PageHeader } from '@/components/ui';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { getAsset } from '@/server/assets';
import { authorize } from '@/server/authorize';
import { getContractDetails } from '@/server/contracts';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/contracts/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('contract.title') }) };
}

export default async function ContractPage({
  params,
  searchParams,
}: PageProps<'/[locale]/contracts/[id]'>) {
  const { locale, id } = await params;
  const fromLeases = (await searchParams).from === 'leases';
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const today = await todayForRequest();

  const actor = await readActor(db);
  const auth = await authorize(db, actor, 'read_contract', { contract: id });
  const details = auth.ok ? await getContractDetails(db, id, today) : null;
  if (!details) {
    const code = auth.ok ? 'not_found' : auth.reason.code;
    const message =
      code === 'not_found'
        ? t('contract.notFound')
        : code === 'not_signed_in'
          ? t('authz.refusal.not_signed_in')
          : t('contract.notAllowed');
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title={t('contract.title')} />
        <Notice tone="warning">{message}</Notice>
      </div>
    );
  }
  const asset = await getAsset(db, details.contract.assetId);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      {fromLeases ? (
        <Link
          href={`/${locale}/leases`}
          className="inline-flex items-center gap-1 rounded font-bold underline decoration-brand/30 decoration-2 underline-offset-4 hover:decoration-brand"
        >
          <span aria-hidden="true">←</span>
          {t('contract.backToLeases')}
        </Link>
      ) : null}
      <PageHeader
        title={t('contract.title')}
        intro={t('contract.number', { number: details.contract.number })}
      />
      <ContractSummary details={details} asset={asset} locale={locale} t={t} />
      <ContractExit
        contract={details.contract}
        asset={asset}
        today={today}
        locale={locale}
        t={t}
        isAdmin={actor === ADMIN_ACTOR}
      />
      <Card title={t('invoice.title')}>
        <InvoiceTable contractId={details.contract.id} today={today} locale={locale} t={t} />
      </Card>
      {fromLeases ? (
        <LinkButton href={`/${locale}/leases`}>
          <span aria-hidden="true">←</span> {t('contract.backToLeases')}
        </LinkButton>
      ) : null}
    </div>
  );
}
