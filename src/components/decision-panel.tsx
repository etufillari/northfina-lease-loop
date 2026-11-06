// The outcome of the eligibility check: approved, refused or sent to a person, with the reasons
// in plain language. The domain returns reason ids and numbers; the words live in the i18n files.
// Colours are the design tokens from AGENTS.md, the same raw values as contract.tsx.
import type { EligibilityDecision, Reason } from '@/domain/eligibility';
import { formatEuro } from '@/domain/money';
import { messages, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { OfferCreatedCard } from './offer-created-card';

export function reasonText(t: Translate, reason: Reason, locale: Locale): string {
  const { rule, params } = reason;

  if (rule === 'financed_limits') {
    return t(`reason.financed_limits.${String(params.reason)}` as MessageKey);
  }
  if (rule === 'affordability') {
    return t('reason.affordability', {
      rent: formatEuro(Number(params.rentCents), intlLocale[locale]),
      income: formatEuro(Number(params.incomeCents), intlLocale[locale]),
    });
  }
  const key = `reason.${rule}`;
  return key in messages.en ? t(key as MessageKey, params) : t('reason.blocked_answer');
}

const tones = {
  yes: {
    box: 'border-[#cde5d5] bg-[#eaf0ec] text-[#14522a] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    title: 'text-[#14522a] dark:text-emerald-200',
  },
  no: {
    box: 'border-[#DC2626] bg-[#f8f7f6] text-[#353331] dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
    title: 'text-[#DC2626] dark:text-red-300',
  },
  manual_review: {
    box: 'border-[#e9dac8] bg-[#f8f7f6] text-[#5c360a] dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
    title: 'text-[#b76200] dark:text-amber-300',
  },
  incomplete: {
    box: 'border-[#dad9d8] bg-[#f7f7f7] text-[#353331] dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-200',
    title: 'text-[#353331] dark:text-stone-100',
  },
} as const;

export function DecisionPanel({
  decision,
  locale,
  t,
  onSign,
  isSigning = false,
  isEvaluating = false,
  signError = null,
  onCreateOffer,
  isCreatingOffer = false,
  offerDetails = null,
}: {
  decision: EligibilityDecision;
  locale: Locale;
  t: Translate;
  onSign?: () => void;
  isSigning?: boolean;
  isEvaluating?: boolean;
  signError?: string | null;
  onCreateOffer?: () => void;
  isCreatingOffer?: boolean;
  offerDetails?: {
    token: string;
    expiresAt: string;
    assetId: string;
    termMonths: number;
    downPaymentCents: number;
  } | null;
}) {
  const kind = decision.decision;
  const tone = tones[kind];
  const body =
    kind === 'incomplete'
      ? t('decision.incomplete.body', { count: decision.missing.length })
      : t(`decision.${kind}.body`);

  return (
    <section
      aria-labelledby="decision-title"
      className={`rounded-[12px] border p-[24px] ${tone.box}`}
    >
      <p className="text-[0.75rem] font-semibold tracking-wider uppercase">
        {t('decision.heading')}
      </p>
      <h2
        id="decision-title"
        className={`mt-[4px] text-[1.375rem] leading-tight font-bold ${tone.title}`}
      >
        {t(`decision.${kind}.title`)}
      </h2>
      <p className="mt-[8px]">{body}</p>
      {kind !== 'incomplete' && decision.reasons.length > 0 ? (
        <ul className="mt-[12px] list-disc space-y-[8px] pl-[20px]">
          {decision.reasons.map((reason, i) => (
            <li key={`${reason.rule}-${i}`}>{reasonText(t, reason, locale)}</li>
          ))}
        </ul>
      ) : null}
      {kind === 'yes' && onSign ? (
        <div className="mt-[16px] space-y-[8px]">
          {signError ? (
            <p
              role="alert"
              className="mb-[8px] text-[0.875rem] font-semibold text-[#DC2626] dark:text-red-300"
            >
              {signError}
            </p>
          ) : null}
          {offerDetails ? (
            <OfferCreatedCard
              token={offerDetails.token}
              expiresAt={offerDetails.expiresAt}
              assetId={offerDetails.assetId}
              termMonths={offerDetails.termMonths}
              downPaymentCents={offerDetails.downPaymentCents}
              locale={locale}
              onSign={onSign}
              isSigning={isSigning}
              isEvaluating={isEvaluating}
            />
          ) : (
            <>
              <button
                type="button"
                disabled={isSigning || isEvaluating || isCreatingOffer}
                onClick={onSign}
                className="w-full rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] transition-colors hover:bg-[#1354a5] disabled:cursor-not-allowed disabled:bg-[#857f7a] dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-stone-700 dark:disabled:text-stone-400"
              >
                {isSigning ? t('apply.signingButton') : t('apply.signButton')}
              </button>
              {onCreateOffer ? (
                <button
                  type="button"
                  disabled={isSigning || isEvaluating || isCreatingOffer}
                  onClick={onCreateOffer}
                  className="w-full rounded-[8px] border border-[#bfbcbb] bg-[#FFFFFF] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#353331] transition-colors hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  {isCreatingOffer ? t('contract.offerCreating') : t('contract.createOfferButton')}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
