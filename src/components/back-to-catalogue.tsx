// "← Back to …" links, styled like the ones on the item and fleet pages. They keep the
// time-travel date (?asOf=) so going back does not jump to another day.
import Link from 'next/link';
import type { Locale } from '@/i18n/locales';

/** A back link to `path` (e.g. `/en/assets/ebike-003`), keeping ?asOf= when set. */
export function BackLink({
  path,
  label,
  asOfParam,
}: {
  path: string;
  label: string;
  asOfParam: string | null;
}) {
  return (
    <Link
      href={`${path}${asOfParam ? `?asOf=${asOfParam}` : ''}`}
      className="text-sm text-emerald-800 hover:underline dark:text-emerald-300"
    >
      <span aria-hidden="true">← </span>
      {label}
    </Link>
  );
}

export function BackToCatalogue({
  locale,
  label,
  asOfParam,
}: {
  locale: Locale;
  label: string;
  asOfParam: string | null;
}) {
  return <BackLink path={`/${locale}`} label={label} asOfParam={asOfParam} />;
}
