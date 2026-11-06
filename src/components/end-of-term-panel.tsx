'use client';

// Where the lease stands on the app's date, and at the end of the term the "return the item"
// action. Returning marks the item as returned so it can be refurbished for its next life.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ContractStage } from '@/domain/contract';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type EndOfTermPanelProps = {
  contractId: string;
  assetId: string;
  signerName: string;
  stage: ContractStage;
  status: string;
  startDate: string;
  endDate: string;
  returnedDate: string | null;
  monthsIssued: number;
  termMonths: number;
  locale: Locale;
};

export function EndOfTermPanel(props: EndOfTermPanelProps) {
  const { contractId, assetId, signerName, stage, status, locale } = props;
  const t = getT(locale);
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const date = (iso: string) => formatIsoDate(iso, locale);

  async function returnItem() {
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/contracts/${contractId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: signerName }),
      });
      if (!response.ok) throw new Error('not returned');
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  const returned = status === 'returned';
  const text = returned
    ? t('endOfTerm.returned', { date: date(props.returnedDate ?? props.endDate) })
    : stage === 'not_started'
      ? t('endOfTerm.notStarted', { date: date(props.startDate) })
      : stage === 'active'
        ? t('endOfTerm.active', {
            month: props.monthsIssued,
            total: props.termMonths,
            date: date(props.endDate),
          })
        : t('endOfTerm.ended', { date: date(props.endDate) });

  return (
    <section
      aria-labelledby="end-of-term-heading"
      className={
        'mt-6 rounded-2xl border p-6 shadow-sm print:hidden ' +
        (stage === 'ended' && !returned
          ? 'border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950'
          : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900')
      }
    >
      <h2 id="end-of-term-heading" className="text-lg font-semibold">
        {t('endOfTerm.title')}
      </h2>
      <p className="mt-2 text-stone-700 dark:text-stone-300">{text}</p>

      {stage === 'ended' && !returned ? (
        <>
          <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
            {t('endOfTerm.returnExplained')}
          </p>
          <button
            type="button"
            onClick={returnItem}
            disabled={sending}
            className="mt-4 rounded-lg bg-sky-700 px-5 py-2.5 font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {sending ? t('endOfTerm.returning') : t('endOfTerm.return')}
          </button>
          {failed ? (
            <p role="alert" className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
              {t('endOfTerm.failed')}
            </p>
          ) : null}
        </>
      ) : null}

      {returned ? (
        <Link
          href={`/${locale}/assets/${assetId}`}
          className="mt-4 inline-block text-sm font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
        >
          {t('endOfTerm.seeItem')}
        </Link>
      ) : null}
    </section>
  );
}
