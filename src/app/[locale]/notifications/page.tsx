// What needs the viewer's attention on the app's date: leases that have ended (choose what
// happens next), items passed on to them (accept or decline), and invoices to pay. The bell in
// the header counts these and links here.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { HandoverResponse } from '@/components/handover-response';
import { PayAllButton } from '@/components/pay-all-button';
import { contractNumber } from '@/domain/contract';
import { invoiceLabel } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { listAssets } from '@/server/assets';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { notificationsFor } from '@/server/notifications';

export default async function NotificationsPage({ params }: PageProps<'/[locale]/notifications'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const [{ today }, viewer] = await Promise.all([appDate(), currentViewer()]);
  const [notes, assets] = await Promise.all([notificationsFor(db, viewer, today), listAssets(db)]);
  const name = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    return asset ? `${asset.make} ${asset.model}` : assetId;
  };
  const date = (iso: string) => formatIsoDate(iso, locale);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('notifications.title')}
      </h1>
      <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">
        {notes.count === 0
          ? t('notifications.none')
          : t('notifications.count', { count: notes.count })}
      </p>

      {notes.endedLeases.length > 0 ? (
        <Section title={t('notifications.ended')}>
          {notes.endedLeases.map((contract) => (
            <Card key={contract.id} tone="sky">
              <p>
                {t('notifications.endedText', {
                  item: name(contract.assetId),
                  date: date(contract.endDate),
                })}
              </p>
              <Link
                href={`/${locale}/contracts/${contract.id}/end`}
                className="mt-3 inline-block rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
              >
                {t('notifications.choose')}
              </Link>
            </Card>
          ))}
        </Section>
      ) : null}

      {notes.handovers.length > 0 ? (
        <Section title={t('notifications.passedToYou')}>
          {notes.handovers.map((handover) => (
            <Card key={handover.id} tone="violet">
              <p>
                {t('notifications.passedText', {
                  from: handover.fromName,
                  item: name(handover.assetId),
                  date: date(handover.passedDate),
                })}
              </p>
              <p className="mt-1 mb-3 text-sm text-stone-600 dark:text-stone-400">
                {t('notifications.passedExplained')}
              </p>
              {viewer.kind === 'customer' ? (
                <HandoverResponse handoverId={handover.id} locale={locale} />
              ) : null}
            </Card>
          ))}
        </Section>
      ) : null}

      {notes.dueInvoices.length > 0 ? (
        <Section title={t('invoices.toPay')}>
          {notes.dueInvoices.map(({ contract, invoice }) => (
            <Card key={`${contract.id}-${invoice.number}`} tone="amber">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  {name(contract.assetId)} ·{' '}
                  <span className="font-mono text-sm">
                    {invoiceLabel(contractNumber(contract.id), invoice.number)}
                  </span>{' '}
                  · {t('pay.due', { date: date(invoice.dueDate) })}
                </p>
                <Link
                  href={`/${locale}/contracts/${contract.id}/invoices/${invoice.number}/pay`}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  {t('invoice.payNow')} · {formatEuro(invoice.totalCents, intlLocale[locale])}
                </Link>
              </div>
            </Card>
          ))}
          <li className="pt-2">
            <PayAllButton
              label={t('invoices.payAll', {
                count: notes.dueInvoices.length,
                total: formatEuro(
                  notes.dueInvoices.reduce((sum, r) => sum + r.invoice.totalCents, 0),
                  intlLocale[locale]
                ),
              })}
              failedLabel={t('pay.failed')}
            />
          </li>
        </Section>
      ) : null}

      <p className="mt-10">
        <Link
          href={`/${locale}/invoices`}
          className="font-medium text-emerald-800 underline dark:text-emerald-300"
        >
          {t('notifications.allInvoices')}
        </Link>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="border-b border-stone-200 pb-2 text-xl font-semibold dark:border-stone-800">
        {title}
      </h2>
      <ul className="mt-4 space-y-3">{children}</ul>
    </section>
  );
}

const tones = {
  sky: 'border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950',
  violet: 'border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950',
  amber: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950',
} as const;

function Card({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return <li className={`rounded-xl border p-4 ${tones[tone]}`}>{children}</li>;
}
