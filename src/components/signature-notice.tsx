// What the applicant sees while their company's signatory decides (card 6): waiting for that
// person (and until when the price holds), signed, declined with the note, or expired. The
// demo link opens the admin's Signatures page, where staff act as the signatory.
import Link from 'next/link';
import type { SignatureRequest } from '@/server/signatures';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { DemoTag } from './demo-note';
import { SignatureStatusBadge } from './signature-status-badge';

type SignatureNoticeProps = { request: SignatureRequest; locale: Locale; t: Translate };

export function SignatureNotice({ request, locale, t }: SignatureNoticeProps) {
  const email = request.signatoryEmail ?? '—';
  const date = (iso: string) => formatIsoDate(iso, locale);

  return (
    <section
      aria-labelledby="signature-notice-heading"
      className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="signature-notice-heading" className="text-lg font-semibold">
          {t('signatures.applicantTitle')}
        </h2>
        <SignatureStatusBadge status={request.status} t={t} />
      </div>
      <p className="mt-3 text-stone-700 dark:text-stone-300">
        {request.status === 'waiting'
          ? t('signatures.applicantWaiting', { email, until: date(request.validUntil) })
          : request.status === 'declined' && request.declined
            ? t('signatures.applicantDeclined', {
                email: request.declined.by ?? email,
                date: date(request.declined.date),
              })
            : request.status === 'expired'
              ? t('signatures.applicantExpired', { email, date: date(request.validUntil) })
              : request.status === 'needs_review'
                ? t('signatures.applicantNeedsReview', { email })
                : t('signatures.applicantSigned', { email })}
      </p>
      {request.status === 'declined' && request.declined?.note ? (
        <p className="mt-2 text-stone-700 italic dark:text-stone-300">“{request.declined.note}”</p>
      ) : null}
      {request.status === 'waiting' ? (
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
          {t('signatures.applicantNoInvoices')} <DemoTag t={t} />
          <Link
            href={`/${locale}/admin/signatures/${request.id}`}
            className="font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
          >
            {t('signatures.demoLink')}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
