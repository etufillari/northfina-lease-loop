// On a company lease that someone else must sign (card 6): who it's waiting for, what happens
// next, and the signing link to send them. After signing: who signed, and when.
import type { Translate } from '@/i18n/get-t';

export type SigningInfo = {
  email: string;
  /** mailto: draft with the signing link, sent from the customer's own mail app. */
  emailHref: string;
  /** Demo mode only: open the signatory's page directly, as if from the e-mail. */
  demoLink: string | null;
};

export function SignatoryStatus({ t, signing }: { t: Translate; signing: SigningInfo }) {
  return (
    <section
      aria-labelledby="signatory-status"
      className="rounded-lg border border-amber-200 bg-amber-50 p-card text-ink"
    >
      <h2 id="signatory-status" className="text-tagline font-semibold wrap-anywhere">
        {t('signing.waitingTitle', { email: signing.email })}
      </h2>
      <p className="mt-3 max-w-prose text-body">
        {t('signing.waitingBody', { email: signing.email })}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <a
          href={signing.emailHref}
          className="pressable inline-flex min-h-target items-center rounded-pill bg-primary px-6 py-3 text-on-dark"
        >
          {t('signing.sendLink', { email: signing.email })}
        </a>
        {signing.demoLink ? (
          <a
            href={signing.demoLink}
            className="inline-flex min-h-target items-center text-primary underline"
          >
            {t('signing.openDemo')}
          </a>
        ) : null}
      </div>
    </section>
  );
}
