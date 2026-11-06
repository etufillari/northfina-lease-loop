// The decision on an application: a clear yes, no or "a person will check", and every reason
// written from its code in the visitor's language (team rule 6). An admin decides a manual
// review here (D10); an awaiting_signatory case shows the demo outbox: the signing link that
// was sent to the signatory, to the admin only (D46, wave 3 finding 1). The applicant signs an
// approved one into a contract (issue 39), or follows the link to the contract. Authorized
// first (D73): anonymous is asked to pick who they are; anyone but the applicant and the
// admin sees the same "not found" as for an unknown id (D57).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SignContractForm } from '@/components/sign-contract-form';
import { WithdrawButton } from '@/components/withdraw-button';
import { Card, LinkButton, Notice, PageHeader } from '@/components/ui';
import { loadQuestions } from '@/data/load';
import { START_MONTHS_MAX } from '@/domain/contracts';
import { withdrawalCheck } from '@/domain/question-flow/withdraw';
import { addMonthsClamped } from '@/domain/invoicing/dates';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { getApplication, type StoredReason } from '@/server/applications';
import { authorize } from '@/server/authorize';
import { contractIdOfApplication } from '@/server/contracts';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { latestSigningLink } from '@/server/signatories';
import { DecisionForm } from './decision-form';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/applications/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('decision.title') }) };
}

/**
 * Params that are days or cents are written for the reader, a question id as the question's
 * text (`questionText`); the rest as they are.
 */
function formatParams(
  params: StoredReason['params'],
  locale: Locale,
  questionText: Record<string, string>
) {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => {
      if (name === 'question' && typeof value === 'string') {
        return [name, questionText[value] ?? value];
      }
      if (typeof value === 'number' && name.endsWith('Cents')) {
        return [name, formatEuro(value, intlLocale[locale])];
      }
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return [name, formatIsoDate(value, locale)];
      }
      return [name, value];
    })
  );
}

const TONE = {
  approved: 'success',
  rejected: 'error',
  manual_review: 'warning',
  awaiting_signatory: 'warning',
  withdrawn: 'neutral',
} as const;

// The decision panel: one colour, one glyph per outcome. The glyph is decoration; the
// sentence beside it says the same in words.
const PANEL = {
  success: 'border-success-line bg-success-soft text-success-ink',
  warning: 'border-warning-line bg-warning-soft text-warning-ink',
  error: 'border-danger-line bg-danger-soft text-danger-ink',
  neutral: 'border-line bg-muted text-ink',
} as const;
const ICON = {
  success: 'bg-success-solid text-raised',
  warning: 'bg-warning-solid text-raised',
  error: 'bg-danger-solid text-raised',
  neutral: 'bg-neutral-solid text-raised',
} as const;
const GLYPH = { success: '✓', warning: '…', error: '!', neutral: '×' } as const;

export default async function ApplicationPage({
  params,
  searchParams,
}: PageProps<'/[locale]/applications/[id]'>) {
  const { locale, id } = await params;
  // `?from=leases`: opened from My leases (rows.tsx), so the way back leads there first.
  const fromLeases = (await searchParams).from === 'leases';
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);

  const actor = await readActor(db);
  const auth = await authorize(db, actor, 'read_application', { application: id });
  const application = auth.ok ? await getApplication(db, id) : null;
  if (!application) {
    const signIn = !auth.ok && auth.reason.code === 'not_signed_in';
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title={t('decision.title')} />
        <Notice tone="warning">
          {t(signIn ? 'authz.refusal.not_signed_in' : 'decision.notFound')}
        </Notice>
      </div>
    );
  }
  const questionText = Object.fromEntries(
    (await loadQuestions()).questions.map((q) => [q.id, q.text[locale]])
  );
  const dictionary: Record<string, string> = messages[locale];
  const reasonText = (reason: StoredReason) => {
    const key = `decision.reason.${reason.code}`;
    return key in dictionary
      ? t(key as MessageKey, formatParams(reason.params, locale, questionText))
      : t('decision.reason.unknown', { code: reason.code });
  };
  const { decision } = application;
  // Read once here and passed down (team rule 4); the server signs on its own today anyway.
  const today = await todayForRequest();
  const contractId = decision === 'approved' ? await contractIdOfApplication(db, id) : null;
  // D87: the applicant (or the admin for them) may step back while it is not a lease yet.
  const mayWithdraw =
    (actor === application.customerId || actor === ADMIN_ACTOR) &&
    withdrawalCheck(decision, contractId !== null).ok;
  // The demo outbox stands in for the e-mail to the signatory: the admin's view only, never
  // the coordinator's, who must not hold the token (D46, wave 3 finding 1).
  const link =
    decision === 'awaiting_signatory' && actor === ADMIN_ACTOR
      ? await latestSigningLink(db, application.id, today)
      : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('decision.title')} />
      {/* The outcome is the page's first heading under the h1; it is there on load, so it
          is not announced as a live region. */}
      <div
        className={`mb-8 flex items-center gap-5 rounded-xl border-2 p-6 ${PANEL[TONE[decision]]}`}
      >
        <span
          aria-hidden="true"
          className={`grid size-14 shrink-0 place-items-center rounded-full font-heading text-3xl font-semibold ${ICON[TONE[decision]]}`}
        >
          {GLYPH[TONE[decision]]}
        </span>
        <div>
          <h2 className="font-heading text-2xl leading-tight font-semibold sm:text-3xl">
            {t(`decision.status.${decision}`)}
          </h2>
          <p className="mt-1">
            {t(decision === 'withdrawn' ? 'decision.withdrawnOn' : 'decision.decidedOn', {
              date: formatIsoDate(application.decidedOn, locale),
            })}
          </p>
        </div>
      </div>

      {/* A yes needs no reasons ("every check passed" says nothing new); a no, a manual
          review or a wait for the signatory does, without a badge repeating the panel. */}
      {/* A cancelled one needs no "why" either: the panel says it, and the old reasons no
          longer matter. */}
      {decision === 'approved' || decision === 'withdrawn' ? null : (
        <Card as="section" title={t('decision.reasons')} titleId="decision-reasons">
          <ul className="list-disc space-y-2 pl-5">
            {application.reasons.map((reason, index) => (
              <li key={`${reason.code}-${index}`}>{reasonText(reason)}</li>
            ))}
          </ul>
        </Card>
      )}

      {decision === 'approved' ? (
        <Card as="section" title={t('contract.sign.title')} titleId="contract-sign">
          {contractId ? (
            <div className="space-y-4">
              <p>{t('contract.sign.done')}</p>
              <LinkButton href={`/${locale}/contracts/${contractId}`}>
                {t('contract.sign.open')}
              </LinkButton>
            </div>
          ) : actor === application.customerId ? (
            <div className="space-y-4">
              <p>{t('contract.sign.intro')}</p>
              <SignContractForm
                applicationId={application.id}
                locale={locale}
                today={today}
                maxStartDate={addMonthsClamped(today, START_MONTHS_MAX)}
                maxMonths={START_MONTHS_MAX}
              />
            </div>
          ) : actor === ADMIN_ACTOR ? (
            // D88: the admin reviews and may apply on a customer's behalf, but never signs.
            <Notice tone="info">{t('authz.refusal.customer_signs')}</Notice>
          ) : (
            <Notice tone="info">{t('contract.sign.applicantOnly')}</Notice>
          )}
        </Card>
      ) : null}

      {decision === 'manual_review' ? (
        <Card
          as="section"
          title={t('decision.review.title')}
          titleId="decision-review"
          className="mt-6"
        >
          {actor === ADMIN_ACTOR ? (
            <DecisionForm
              applicationId={application.id}
              labels={{ approve: t('decision.approve'), reject: t('decision.reject') }}
              failures={{
                error: t('decision.error'),
                APPLICATION_NOT_PENDING: t('decision.failure.APPLICATION_NOT_PENDING'),
                not_signed_in: t('authz.refusal.not_signed_in'),
                not_owner: t('authz.refusal.not_owner'),
                admin_only: t('authz.refusal.admin_only'),
                signatory_required: t('authz.refusal.signatory_required'),
              }}
            />
          ) : (
            <Notice tone="info">{t('decision.review.adminOnly')}</Notice>
          )}
        </Card>
      ) : null}

      {decision === 'awaiting_signatory' ? (
        <Card
          as="section"
          title={t('decision.waiting.title')}
          titleId="decision-waiting"
          className="mt-6"
        >
          <p>
            {t('decision.waiting.body', {
              who: signatoryOf(application.reasons) ?? t('decision.waiting.someone'),
            })}
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>{t('decision.waiting.step1')}</li>
            <li>{t('decision.waiting.step2')}</li>
            <li>{t('decision.waiting.step3')}</li>
          </ol>
          <p className="mt-3 text-ink-muted">{t('decision.waiting.nothingToDo')}</p>
        </Card>
      ) : null}

      {decision === 'awaiting_signatory' && actor === ADMIN_ACTOR ? (
        <Card
          as="section"
          title={t('decision.outbox.title')}
          titleId="decision-outbox"
          className="mt-6"
        >
          <Notice tone="info">{t('decision.outbox.notHere')}</Notice>
          {link ? (
            <div className="mt-4 space-y-3">
              <p>
                {t('decision.outbox.sent', {
                  email: link.signatoryEmail,
                  date: formatIsoDate(link.sentOn, locale),
                  expires: formatIsoDate(link.expiresOn, locale),
                })}
              </p>
              <p className="text-sm text-ink-muted">{t('decision.outbox.demo')}</p>
              <LinkButton href={`/${locale}/sign/${link.token}`}>
                {t('decision.outbox.open')}
              </LinkButton>
              <p className="text-sm text-ink-muted break-all">
                /{locale}/sign/{link.token}
              </p>
            </div>
          ) : (
            <p className="mt-4">{t('decision.outbox.none')}</p>
          )}
        </Card>
      ) : null}

      {mayWithdraw ? (
        <Card as="section" title={t('withdraw.title')} titleId="withdraw" className="mt-6">
          <p className="mb-4 text-ink-muted">{t('withdraw.intro')}</p>
          <WithdrawButton applicationId={application.id} locale={locale} />
        </Card>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        {fromLeases ? (
          <LinkButton href={`/${locale}/leases`}>
            <span aria-hidden="true">←</span> {t('decision.backToLeases')}
          </LinkButton>
        ) : null}
        <LinkButton href={`/${locale}`} variant={fromLeases ? 'secondary' : 'primary'}>
          {fromLeases ? null : <span aria-hidden="true">← </span>}
          {t('decision.home')}
        </LinkButton>
        <LinkButton href={`/${locale}/catalogue`} variant="secondary">
          {t('decision.catalogue')}
        </LinkButton>
      </div>
    </div>
  );
}

/** The signatory the applicant named, from the `signatory_needed` reason; null when none is. */
function signatoryOf(reasons: readonly StoredReason[]): string | null {
  const email = reasons.find((r) => r.code === 'signatory_needed')?.params.signatoryEmail;
  return typeof email === 'string' && email !== '' ? email : null;
}
