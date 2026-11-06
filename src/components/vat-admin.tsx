'use client';

// Admin: the VAT rates in force (data pack + admin changes) and a form to add a rate from a
// future date, e.g. 27 % from 1 Jul 2027. Invoices, quotes and contracts follow at once.
// Having the admin page open is enough: like the rest of this demo, there is no real login.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { addDays } from '@/domain/contract';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type VatRow = {
  validFrom: string;
  validTo: string | null;
  ratePercent: number;
  /** Set for a change added on the admin page (it can be removed while it hasn't started). */
  adminId: number | null;
};

type VatAdminProps = { rates: VatRow[]; today: string; locale: Locale };

const errorKeys = {
  NOT_IN_FUTURE: 'admin.vat.errorPast',
  INVALID_RATE: 'admin.vat.errorRate',
  ALREADY_IN_FORCE: 'admin.vat.errorInForce',
} as const;

export function VatAdmin({ rates, today, locale }: VatAdminProps) {
  const t = getT(locale);
  const router = useRouter();
  const firstAllowed = addDays(today, 1);
  const [validFrom, setValidFrom] = useState(firstAllowed);
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, init);
      const payload = (await response.json()) as { error?: { code: string } };
      if (!response.ok) {
        const code = payload.error?.code as keyof typeof errorKeys | undefined;
        setError(t(code && code in errorKeys ? errorKeys[code] : 'admin.vat.errorGeneric'));
        return;
      }
      setRate('');
      router.refresh();
    } catch {
      setError(t('admin.vat.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    void send('/api/admin/vat-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validFrom, ratePercent: Number(rate.replace(',', '.')) }),
    });
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm tabular-nums">
          <thead className="text-left text-stone-600 dark:text-stone-400">
            <tr className="border-b border-stone-200 dark:border-stone-700">
              <th scope="col" className="py-2 pr-3 font-medium">
                {t('admin.vat.from')}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t('admin.vat.to')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('admin.vat.rate')}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t('admin.vat.source')}
              </th>
              <th scope="col" className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rates.map((row) => {
              const inForce =
                row.validFrom <= today && (row.validTo === null || today <= row.validTo);
              return (
                <tr
                  key={row.validFrom}
                  className={
                    'border-b border-stone-100 dark:border-stone-800 ' +
                    (inForce ? 'bg-emerald-50 font-medium dark:bg-emerald-950/50' : '')
                  }
                >
                  <td className="py-1.5 pr-3">{formatIsoDate(row.validFrom, locale)}</td>
                  <td className="py-1.5 pr-3">
                    {row.validTo ? formatIsoDate(row.validTo, locale) : t('admin.vat.untilFurther')}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatNumber(row.ratePercent, locale)} %
                  </td>
                  <td className="py-1.5 pr-3">
                    {row.adminId === null ? t('admin.vat.fromData') : t('admin.vat.fromAdmin')}
                    {inForce ? ` · ${t('admin.vat.inForce')}` : ''}
                  </td>
                  <td className="py-1.5 text-right">
                    {row.adminId !== null && row.validFrom > today ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void send(`/api/admin/vat-changes/${row.adminId}`, { method: 'DELETE' })
                        }
                        className="text-sm font-medium text-rose-700 underline disabled:opacity-50 dark:text-rose-300"
                      >
                        {t('admin.vat.remove')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={add} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          {t('admin.vat.newFrom')}
          <input
            type="date"
            required
            min={firstAllowed}
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
          />
        </label>
        <label className="text-sm font-medium">
          {t('admin.vat.newRate')}
          <input
            type="number"
            required
            min={0}
            max={100}
            step="0.01"
            inputMode="decimal"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            placeholder="27"
            className="mt-1 block w-28 rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
          />
        </label>
        <button
          type="submit"
          disabled={busy || rate === ''}
          className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {t('admin.vat.add')}
        </button>
      </form>

      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{t('admin.vat.rules')}</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
