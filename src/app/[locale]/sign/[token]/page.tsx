// The signing link (D46): who signs for which company and application, the quote they sign
// for, and Sign or Decline. Whoever holds the link acts as the named signatory; in production
// Suomi.fi identification would check the person first. The actor picker plays no part.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Card, DefinitionList, LinkButton, Notice, PageHeader } from '@/components/ui';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { getApplication } from '@/server/applications';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { getQuote } from '@/server/quotes';
import { getSigningLink } from '@/server/signatories';
import { SignForm } from './sign-form';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/sign/[token]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('sign.title') }) };
}

export default async function SignPage({ params }: PageProps<'/[locale]/sign/[token]'>) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const today = await todayForRequest();
  const page = (body: React.ReactNode) => (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('sign.title')} intro={t('sign.intro')} />
      {body}
    </div>
  );

  const link = /^[A-Za-z0-9_-]{32,64}$/.test(token) ? await getSigningLink(db, token, today) : null;
  if (!link) return page(<Notice tone="warning">{t('sign.notFound')}</Notice>);
  const [application, company] = await Promise.all([
    getApplication(db, link.applicationId),
    getCustomer(db, link.customerId),
  ]);
  const quote = application ? await getQuote(db, application.quoteId) : null;
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const deal = quote?.breakdown;

  const items = [
    { label: t('sign.signatory'), value: `${link.signatoryName} · ${link.signatoryEmail}` },
    { label: t('sign.company'), value: company?.name ?? link.customerId },
    ...(deal
      ? [
          { label: t('sign.asset'), value: deal.assetId },
          { label: t('sign.term'), value: t('sign.months', { months: deal.termMonths }) },
          { label: t('sign.financed'), value: money(deal.financedCents), numeric: true },
          { label: t('sign.monthly'), value: money(deal.monthlyNetCents), numeric: true },
        ]
      : []),
    { label: t('sign.expires'), value: date(link.expiresOn) },
  ];

  const { outcome } = link;
  return page(
    <>
      <Card as="section" title={t('sign.what')} titleId="sign-what">
        <DefinitionList items={items} />
      </Card>
      <Card as="section" title={t('sign.decide')} titleId="sign-decide" className="mt-6">
        {outcome.code === 'pending' ? (
          <SignForm
            token={token}
            labels={{ sign: t('sign.sign'), decline: t('sign.decline') }}
            failures={{
              error: t('sign.error'),
              SIGNING_LINK_NOT_FOUND: t('sign.failure.SIGNING_LINK_NOT_FOUND'),
              SIGNING_LINK_EXPIRED: t('sign.failure.SIGNING_LINK_EXPIRED'),
              SIGNING_LINK_USED: t('sign.failure.SIGNING_LINK_USED'),
              SIGNATORY_NOT_ACTIVE: t('sign.failure.SIGNATORY_NOT_ACTIVE'),
              APPLICATION_NOT_PENDING: t('sign.failure.APPLICATION_NOT_PENDING'),
            }}
          />
        ) : outcome.code === 'expired' ? (
          <Notice tone="warning">
            {t('sign.expired', { date: date(outcome.params.expiresOn) })}
          </Notice>
        ) : (
          <div className="space-y-4">
            <Notice tone={outcome.params.outcome === 'signed' ? 'success' : 'info'}>
              {t(outcome.params.outcome === 'signed' ? 'sign.signed' : 'sign.declined', {
                date: date(outcome.params.on),
              })}
            </Notice>
            <LinkButton variant="secondary" href={`/${locale}/applications/${link.applicationId}`}>
              {t('sign.toApplication')}
            </LinkButton>
          </div>
        )}
      </Card>
    </>
  );
}
