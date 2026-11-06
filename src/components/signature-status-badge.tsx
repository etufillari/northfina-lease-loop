// The "Waiting for signature / Signed / Declined / Expired / Needs review" pill of a card 6
// signature request, shared by the admin's Signatures pages. Always a word, never colour only.
import type { SignatureStatus } from '@/domain/signature';
import type { Translate } from '@/i18n/get-t';

const styles: Record<SignatureStatus, string> = {
  waiting:
    'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  signed:
    'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
  declined:
    'bg-rose-50 text-rose-900 ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800',
  expired:
    'bg-stone-100 text-stone-800 ring-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-600',
  needs_review:
    'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
};

export function SignatureStatusBadge({ status, t }: { status: SignatureStatus; t: Translate }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {t(`signatures.status.${status}`)}
    </span>
  );
}
