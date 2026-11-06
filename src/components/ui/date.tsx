// An ISO day in the page's language, as a <time> element: 2026-11-06 → "6. marraskuuta 2026".
import { formatIsoDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locales';

type DateTextProps = { iso: string; locale: Locale; className?: string };

export function DateText({ iso, locale, className }: DateTextProps) {
  return (
    <time dateTime={iso} className={className}>
      {formatIsoDate(iso, locale)}
    </time>
  );
}
