// The invoices that have reached the viewer: the ones to pay first, then the paid ones. The
// bell in the header links here and counts the unpaid ones.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { contractNumber } from '@/domain/contract';
import { invoiceLabel } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { listAssets } from '@/server/assets';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { receivedInvoices, type ReceivedInvoice } from '@/server/invoices';
import { viewerCustomerId } from '@/server/viewer';

export default async function InvoicesPage({ params }: PageProps<'/[locale]/invoices'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const [{ today }, viewer] = await Promise.all([appDate(), currentViewer()]);
  const filter = viewer.kind === 'staff' ? null : { customerId: viewerCustomerId(viewer) };
  const [received, assets] = await Promise.all([
    receivedInvoices(db, filter, today),
    listAssets(db),
  ]);
  const assetName = new Map(assets.map((a) => [a.id, `${a.make} ${a.model}`]));
  const due = received.filter((r) => r.invoice.status === 'due');
  const paid = received.filter((r) => r.invoice.status === 'paid');

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('invoices.title')}</h1>
      <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">
        {due.length > 0 ? t('invoices.toPayIntro', { count: due.length }) : t('invoices.allPaid')}
      </p>

      <Section title={t('invoices.toPay')} empty={t('invoices.nothingToPay')}>
        {due.map((r) => (
          <Item
            key={`${r.contract.id}-${r.invoice.number}`}
            r={r}
            name={assetName}
            locale={locale}
            t={t}
          />
        ))}
      </Section>
      <Section title={t('invoices.paid')} empty={t('invoices.nothingPaid')}>
        {paid.map((r) => (
          <Item
            key={`${r.contract.id}-${r.invoice.number}`}
            r={r}
            name={assetName}
            locale={locale}
            t={t}
          />
        ))}
      </Section>
    </div>
  );
}

function Section(props: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="mt-10">
      <h2 className="border-b border-stone-200 pb-2 text-xl font-semibold dark:border-stone-800">
        {props.title}
      </h2>
      {props.children.length === 0 ? (
        <p className="mt-4 text-stone-600 dark:text-stone-400">{props.empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">{props.children}</ul>
      )}
    </section>
  );
}

function Item(props: {
  r: ReceivedInvoice;
  name: Map<string, string>;
  locale: Locale;
  t: Translate;
}) {
  const { r, name, locale, t } = props;
  const href = `/${locale}/contracts/${r.contract.id}/invoices/${r.invoice.number}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div>
        <Link href={href} className="font-semibold underline-offset-4 hover:underline">
          {name.get(r.contract.assetId) ?? r.contract.assetId}
        </Link>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          <span className="font-mono">
            {invoiceLabel(contractNumber(r.contract.id), r.invoice.number)}
          </span>{' '}
          ·{' '}
          {r.invoice.paidAtSigning && r.invoice.paidDate
            ? t('invoice.paidAtSigning', { date: formatIsoDate(r.invoice.paidDate, locale) })
            : r.invoice.status === 'paid' && r.invoice.paidDate
              ? t('invoice.paidOn', { date: formatIsoDate(r.invoice.paidDate, locale) })
              : t('pay.due', { date: formatIsoDate(r.invoice.dueDate, locale) })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold tabular-nums">
          {formatEuro(r.invoice.totalCents, intlLocale[locale])}
        </span>
        {r.invoice.status === 'due' ? (
          <Link
            href={`${href}/pay`}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            {t('invoice.payNow')}
          </Link>
        ) : (
          <Link
            href={href}
            className="text-sm font-medium text-emerald-800 underline dark:text-emerald-300"
          >
            {t('invoices.view')}
          </Link>
        )}
      </div>
    </li>
  );
}
