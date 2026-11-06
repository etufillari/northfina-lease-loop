'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatEuro } from '@/domain/money';

type Invoice = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  grossCents: number;
  assetId: string;
  assetName: string;
};

export function InvoiceList({
  invoices,
  locale,
  labels,
  currencyLocale,
}: {
  invoices: Invoice[];
  locale: string;
  labels: { allItems: string; selectItem: string; issued: string; due: string; status: string };
  currencyLocale: string;
}) {
  const [assetId, setAssetId] = useState('all');
  const assets = [...new Map(invoices.map((invoice) => [invoice.assetId, invoice.assetName]))];
  const visibleInvoices = invoices.filter(
    (invoice) => assetId === 'all' || invoice.assetId === assetId
  );

  return (
    <>
      <label
        className="mt-6 block text-sm font-medium text-slate-700 dark:text-slate-200"
        htmlFor="invoice-asset"
      >
        {labels.selectItem}
      </label>
      <select
        id="invoice-asset"
        value={assetId}
        onChange={(event) => setAssetId(event.target.value)}
        className="ui-control mt-2 text-sm sm:max-w-md"
      >
        <option value="all">{labels.allItems}</option>
        {assets.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <div className="ui-surface mt-5 overflow-hidden">
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {visibleInvoices.map((invoice) => (
            <Link
              key={invoice.id}
              href={`/${locale}/invoices/${invoice.id}`}
              className="flex flex-wrap items-center justify-between gap-4 p-5 transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div>
                <p className="font-semibold text-[#101d46] dark:text-slate-100">{invoice.number}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {invoice.assetName}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {labels.issued}: {invoice.issueDate} · {labels.due}: {invoice.dueDate}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">
                  {formatEuro(invoice.grossCents, currencyLocale)}
                </p>
                <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  {labels.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
