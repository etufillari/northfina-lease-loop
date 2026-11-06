// The company's signatory list (D46): who may sign for it, from when and until when, who
// granted the right. Seen by the company's own account and the admin; changed by the
// company's own signatory or the admin (the server decides, the page only writes the answer).
// Authorized first (D73): `read_signatories` before the list is read.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';
import { REGISTER_CHECK_SIMULATED } from '@/domain/rows/signatory';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readActor } from '@/server/actor';
import { authorize } from '@/server/authorize';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { listSignatories, type SignatoryState } from '@/server/signatories';
import { AddSignatoryForm, RevokeButton } from './signatory-forms';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/customers/[id]/signatories'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('signatories.title') }) };
}

const BADGE: Record<SignatoryState, 'approved' | 'manual_review' | 'rejected'> = {
  active: 'approved',
  waiting_for_link: 'manual_review',
  not_yet_valid: 'manual_review',
  ended: 'rejected',
};

export default async function SignatoriesPage({
  params,
}: PageProps<'/[locale]/customers/[id]/signatories'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const page = (body: React.ReactNode) => (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('signatories.title')} intro={t('signatories.intro')} />
      {body}
    </div>
  );

  const auth = await authorize(db, await readActor(db), 'read_signatories', { customer: id });
  if (!auth.ok && auth.reason.code === 'not_signed_in') {
    return page(<Notice tone="info">{t('authz.refusal.not_signed_in')}</Notice>);
  }
  if (!auth.ok && auth.reason.code !== 'not_found') {
    return page(<Notice tone="info">{t('signatories.companyOnly')}</Notice>);
  }
  const [company, today] = await Promise.all([getCustomer(db, id), todayForRequest()]);
  if (!company || company.type !== 'company') {
    return page(<Notice tone="warning">{t('signatories.notCompany')}</Notice>);
  }
  const list = await listSignatories(db, id, today);
  const date = (iso: string | null) => (iso === null ? '–' : formatIsoDate(iso, locale));
  const grantedBy = (by: string) =>
    by === REGISTER_CHECK_SIMULATED
      ? t('signatories.registerCheck')
      : (list.find((other) => other.id === by)?.email ?? by);
  const labels = {
    error: t('signatories.error'),
    FORBIDDEN: t('signatories.notAllowed'),
    LAST_SIGNATORY: t('signatories.lastSignatory'),
    SIGNATORY_ALREADY_LISTED: t('signatories.alreadyListed'),
    SIGNATORY_ALREADY_ENDED: t('signatories.alreadyEnded'),
    SIGNATORY_NOT_FOUND: t('signatories.notFound'),
    INVALID_DATES: t('signatories.invalidDates'),
    VALIDATION_ERROR: t('signatories.invalid'),
  };

  return page(
    <>
      <p className="mb-6 font-semibold">{company.name}</p>
      <Card as="section" title={t('signatories.list')} titleId="signatories-list">
        {list.length === 0 ? (
          <p className="text-ink-muted">{t('signatories.none')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="space-y-1">
                  <p className="font-medium">
                    {s.name} <span className="text-ink-muted">· {s.email}</span>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {t('signatories.validity', { from: date(s.validFrom), to: date(s.validTo) })}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {t('signatories.grantedBy', {
                      by: grantedBy(s.grantedBy),
                      on: date(s.grantedOn),
                    })}
                  </p>
                  <Badge status={BADGE[s.state]}>{t(`signatories.state.${s.state}`)}</Badge>
                </div>
                {s.state === 'ended' ? null : (
                  <RevokeButton
                    customerId={id}
                    signatoryId={s.id}
                    label={t('signatories.revoke')}
                    labels={labels}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card as="section" title={t('signatories.add')} titleId="signatories-add" className="mt-6">
        <AddSignatoryForm
          customerId={id}
          today={today}
          fields={{
            name: t('signatories.name'),
            email: t('signatories.email'),
            validFrom: t('signatories.validFrom'),
            validTo: t('signatories.validTo'),
            add: t('signatories.addButton'),
          }}
          labels={labels}
        />
      </Card>
    </>
  );
}
