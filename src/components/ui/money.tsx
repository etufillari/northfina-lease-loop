// Integer cents as euros in the page's language: <Money cents={13466} locale="fi" /> → 134,66 €.
import { formatEuro } from '@/domain/money';
import { intlLocale, type Locale } from '@/i18n/locales';
import { cx } from './cx';

type MoneyProps = { cents: number; locale: Locale; className?: string };

export function Money({ cents, locale, className }: MoneyProps) {
  return (
    <span className={cx('tabular-nums whitespace-nowrap', className)}>
      {formatEuro(cents, intlLocale[locale])}
    </span>
  );
}
