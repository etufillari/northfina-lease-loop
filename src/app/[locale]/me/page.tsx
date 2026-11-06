// "My page": the selected persona's contracts, each with its next invoice highlighted.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { customerPersona, PERSONA_COOKIE } from '@/components/persona-cookie';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { addMonthsClamped } from '@/domain/calendar';
import { invoicesFor, listCustomerContracts } from '@/server/contracts';
import { nominationsFor } from '@/server/nominations';
import { NominationActions } from './nomination-actions';
import { listCustomerOpenApplications, type NextStep } from '@/server/customer-applications';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';

// How each next step is shown: the chip's colour and whether the link is a call to action.
const STEP_STYLE: Record<NextStep, { chip: string; action: 'continue' | 'sign' | 'view' }> = {
  continue: {
    chip: 'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    action: 'continue',
  },
  sign: {
    chip: 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    action: 'sign',
  },
  wait_for_review: {
    chip: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    action: 'view',
  },
  wait_for_signatory: {
    chip: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    action: 'view',
  },
  expired: {
    chip: 'bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:ring-stone-700',
    action: 'view',
  },
};

export default async function MePage({ params, searchParams }: PageProps<'/[locale]/me'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  const suffix = asOfParam ? `?asOf=${asOfParam}` : '';

  const persona = customerPersona((await cookies()).get(PERSONA_COOKIE)?.value);
  const customer = persona ? await getCustomer(db, persona) : null;

  if (!customer) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t('me.title')}</h1>
        <p className="mt-4 text-stone-700 dark:text-stone-300">{t('me.noPersona')}</p>
      </div>
    );
  }

  const [contracts, applications, nominations] = await Promise.all([
    listCustomerContracts(db, customer.id),
    listCustomerOpenApplications(db, customer.id, asOf),
    nominationsFor(db, customer.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{customer.name}</h1>
      <p className="mt-1 text-stone-600 dark:text-stone-400">{customer.email}</p>

      {applications.length > 0 ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">{t('me.applications')}</h2>
          <ul className="mt-4 space-y-4">
            {applications.map((application) => {
              const style = STEP_STYLE[application.nextStep];
              return (
                <li
                  key={application.applicationId}
                  className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {application.assets.map((a) => a.name ?? a.id).join(', ')} ·{' '}
                        {t('price.months', { months: application.termMonths })}
                      </p>
                      <p className="text-sm text-stone-600 dark:text-stone-400">
                        {euro(application.monthlyNetRentCents)} {t('price.exclVat')}{' '}
                        {t('common.perMonth')}
                        {application.nextStep === 'wait_for_signatory' && application.signatoryEmail
                          ? ` · ${application.signatoryEmail}`
                          : ''}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${style.chip}`}
                    >
                      {t(`me.step.${application.nextStep}` as MessageKey)}
                    </span>
                  </div>
                  {application.holdUntil &&
                  (application.nextStep === 'sign' ||
                    application.nextStep === 'wait_for_signatory') ? (
                    <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                      {t('me.holdUntil', { date: formatIsoDate(application.holdUntil, locale) })}
                    </p>
                  ) : null}
                  <Link
                    href={`/${locale}/apply/${application.applicationId}${suffix}`}
                    className="mt-3 inline-block text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                  >
                    {t(`me.action.${style.action}` as MessageKey)} →
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {nominations.length > 0 ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">{t('nomination.title')}</h2>
          <ul className="mt-4 space-y-4">
            {nominations.map((nomination) => (
              <li
                key={nomination.assetId}
                className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-800 dark:bg-emerald-950/40"
              >
                <p className="font-semibold">
                  {nomination.make} {nomination.model}
                </p>
                <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
                  {nomination.status === 'invited'
                    ? t('nomination.invited', { name: nomination.fromName ?? '' })
                    : nomination.status === 'accepted_waiting'
                      ? t('nomination.waiting')
                      : t('nomination.held', {
                          date: formatIsoDate(nomination.until ?? asOf, locale),
                        })}
                </p>
                {nomination.status === 'invited' ? (
                  <NominationActions
                    locale={locale}
                    assetId={nomination.assetId}
                    actor={customer.id}
                    asOfParam={asOfParam}
                  />
                ) : nomination.status === 'held' ? (
                  <Link
                    href={`/${locale}/assets/${nomination.assetId}${suffix}`}
                    className="mt-3 inline-block text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                  >
                    {t('nomination.apply')} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mt-8 text-xl font-semibold">{t('me.contracts')}</h2>
      {contracts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('me.noContracts')}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {contracts.map((contract) => {
            // Only this customer's invoices: after a take-over the later months are someone
            // else's. An invoice is open from its due date until the next one is due.
            const latestDue = invoicesFor(contract, customer.id)
              .filter((i) => i.due_date <= asOf)
              .at(-1);
            const open =
              latestDue && asOf < addMonthsClamped(latestDue.due_date, 1) ? latestDue : null;
            const passedOn = contract.customer_id !== customer.id;
            return (
              <li
                key={contract.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {contract.assets.map((a) => a.asset_id).join(', ')} ·{' '}
                      {t('price.months', { months: contract.term_months })}
                    </p>
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      {formatIsoDate(contract.start_date, locale)} ·{' '}
                      {euro(contract.monthly_net_rent_cents)} {t('price.exclVat')}{' '}
                      {t('common.perMonth')}
                    </p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium ring-1 ring-stone-200 ring-inset dark:bg-stone-800 dark:ring-stone-700">
                    {passedOn
                      ? t('me.passedOn')
                      : t(`contract.status.${contract.status}` as MessageKey)}
                  </span>
                </div>
                {open ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
                    {t('invoice.state.open')}: #{open.number} ·{' '}
                    {formatIsoDate(open.due_date, locale)} · {euro(open.total_cents)}
                  </p>
                ) : null}
                <Link
                  href={`/${locale}/contracts/${contract.id}${suffix}`}
                  className="mt-3 inline-block text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                >
                  {t('me.viewContract')} →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
