// A contract waiting for the person who must sign it (D-053): who, since when, and what happens
// next, with the demo action that signs as them.
import { CountersignButton } from '@/components/countersign-button';
import type { AwaitingSignature } from '@/server/contracts';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function AwaitingSignaturePanel(props: {
  locale: Locale;
  contractId: number;
  awaiting: AwaitingSignature;
  customer: string;
  termMonths: number;
  today: string;
}) {
  const { locale, awaiting } = props;
  const t = getT(locale);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const steps = [
    t('awaiting.stepSign', { email: awaiting.email }),
    t('awaiting.stepStart', { count: props.termMonths }),
    t('awaiting.stepReserved', { customer: props.customer }),
  ];

  return (
    <section
      aria-labelledby="awaiting"
      className="mt-8 rounded-xl bg-warn-bg p-6 text-warn-fg ring-1 ring-warn-fg/30 ring-inset sm:p-8"
    >
      <h2 id="awaiting" className="font-display text-xl font-bold tracking-tight">
        {t('awaiting.title', { email: awaiting.email })}
      </h2>
      <p className="mt-1 text-sm">{t('awaiting.sentOn', { date: date(awaiting.sentOn) })}</p>
      <h3 className="mt-5 text-xs font-semibold tracking-[0.08em] uppercase">
        {t('awaiting.next')}
      </h3>
      <ol className="mt-2 max-w-2xl list-decimal space-y-1.5 pl-5 text-sm">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-warn-fg/20 pt-5">
        <CountersignButton locale={locale} contractId={props.contractId} />
        <p className="max-w-md text-xs">
          {t('awaiting.demoNote', { email: awaiting.email, date: date(props.today) })}
        </p>
      </div>
    </section>
  );
}
