// Shown instead of a bare "rejected" when an applicant is under 18: explains why in plain words,
// says when they can apply, and suggests asking a parent or trusted guardian. The e-mail button is
// a mailto: link, so the applicant's own mail app sends it; the app sends and stores nothing.
import type { Translate } from '@/i18n/get-t';
import { mailtoHref } from './mailto';

export type GuardianItem = { name: string; months: string; link: string };

export function UnderAgeHelp({
  t,
  adultFrom,
  items,
  monthlyTotal,
}: {
  t: Translate;
  /** The formatted date they turn 18, when the birth date is known. */
  adultFrom: string | null;
  items: GuardianItem[];
  monthlyTotal: string;
}) {
  const body = t('application.underAge.emailBody', {
    items: items.map((item) => `${item.name}, ${item.months}: ${item.link}`).join('\n'),
    amount: monthlyTotal,
  });
  return (
    <div className="mt-6 max-w-prose space-y-8">
      <section aria-labelledby="under-age-why">
        <h2 id="under-age-why" className="text-tagline font-semibold">
          {t('application.underAge.whyTitle')}
        </h2>
        <p className="mt-3 text-body">{t('application.underAge.why')}</p>
        <p className="mt-3 text-body">
          {adultFrom
            ? t('application.underAge.when', { date: adultFrom })
            : t('application.underAge.whenUnknown')}
        </p>
      </section>
      <section aria-labelledby="under-age-guardian" className="rounded-lg bg-parchment p-card">
        <h2 id="under-age-guardian" className="text-tagline font-semibold">
          {t('application.underAge.guardianTitle')}
        </h2>
        <p className="mt-3 text-body">{t('application.underAge.guardian')}</p>
        <a
          href={mailtoHref(t('application.underAge.emailSubject'), body)}
          className="pressable mt-6 inline-flex min-h-target items-center rounded-pill bg-primary px-6 py-3 text-on-dark"
        >
          {t('application.underAge.email')}
        </a>
      </section>
    </div>
  );
}
