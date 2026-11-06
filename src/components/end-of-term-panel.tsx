// Where the lease stands on the app's date. Once it has ended it links to the end-of-term page
// (buy, return or pass on); while it runs it links to ending it early; after the choice it
// says what happened.
import Link from 'next/link';
import type { ContractStage } from '@/domain/contract';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type EndOfTermPanelProps = {
  contractId: string;
  assetId: string;
  stage: ContractStage;
  status: string;
  startDate: string;
  endDate: string;
  returnedDate: string | null;
  boughtDate: string | null;
  /** Formatted amount paid for the item, when it was bought. */
  boughtFor: string | null;
  /** Who it was passed on to, when it was. */
  passedTo: string | null;
  /** Set when the lease was ended before its last day (src/domain/early-exit.ts). */
  exitedEarlyDate: string | null;
  /** Formatted exit fee paid when it was returned early. */
  exitFee: string | null;
  monthsIssued: number;
  termMonths: number;
  locale: Locale;
  t: Translate;
};

export function EndOfTermPanel(props: EndOfTermPanelProps) {
  const { contractId, assetId, stage, status, locale, t } = props;
  const date = (iso: string | null) => formatIsoDate(iso ?? props.endDate, locale);
  const decided = status !== 'active';
  const waiting = stage === 'ended' && !decided;

  const early = props.exitedEarlyDate !== null;
  const text =
    early && status === 'returned'
      ? t('endOfTerm.exitedReturned', {
          date: date(props.exitedEarlyDate),
          amount: props.exitFee ?? '',
        })
      : early && status === 'bought'
        ? t('endOfTerm.exitedBought', {
            date: date(props.exitedEarlyDate),
            amount: props.boughtFor ?? '',
          })
        : status === 'returned'
          ? t('endOfTerm.returned', { date: date(props.returnedDate) })
          : status === 'bought'
            ? t('endOfTerm.bought', { date: date(props.boughtDate), amount: props.boughtFor ?? '' })
            : status === 'passed_on'
              ? t('endOfTerm.passedOn', {
                  date: date(props.returnedDate),
                  name: props.passedTo ?? '',
                })
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
        (waiting
          ? 'border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950'
          : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900')
      }
    >
      <h2 id="end-of-term-heading" className="text-lg font-semibold">
        {t('endOfTerm.title')}
      </h2>
      <p className="mt-2 text-stone-700 dark:text-stone-300">{text}</p>

      {waiting ? (
        <Link
          href={`/${locale}/contracts/${contractId}/end`}
          className="mt-4 inline-block rounded-lg bg-sky-700 px-5 py-2.5 font-semibold text-white hover:bg-sky-800"
        >
          {t('notifications.choose')}
        </Link>
      ) : null}

      {stage === 'active' && !decided ? (
        <Link
          href={`/${locale}/contracts/${contractId}/exit`}
          className="mt-4 inline-block text-sm font-medium text-stone-700 underline underline-offset-4 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
        >
          {t('exit.link')}
        </Link>
      ) : null}

      {decided ? (
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
