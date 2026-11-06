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
  const visibleInvoices = invoices
    .filter((invoice) => assetId === 'all' || invoice.assetId === assetId)
    .slice(0, 9);

  return (
    <>
      <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="invoice-asset">
        {labels.selectItem}
      </label>
      <select
        id="invoice-asset"
        value={assetId}
        onChange={(event) => setAssetId(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 sm:max-w-md"
      >
        <option value="all">{labels.allItems}</option>
        {assets.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-200">
          {visibleInvoices.map((invoice) => (
            <Link
              key={invoice.id}
              href={`/${locale}/invoices/${invoice.id}`}
              className="flex flex-wrap items-center justify-between gap-4 p-5 transition hover:bg-slate-50"
            >
              <div>
                <p className="font-semibold text-[#101d46]">{invoice.number}</p>
                <p className="mt-1 text-sm text-slate-500">{invoice.assetName}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {labels.issued}: {invoice.issueDate} · {labels.due}: {invoice.dueDate}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">
                  {formatEuro(invoice.grossCents, currencyLocale)}
                </p>
                <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
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
