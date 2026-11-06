// The way into an item's passport from its price page: a card dressed as a passport cover
// (forest green, a booklet), under the item's specs. A server component; the passport page is
// /[locale]/assets/[id]/passport.
import Link from 'next/link';
import { cx } from './ui';

function passportHref(locale: string, assetId: string): string {
  return `/${locale}/assets/${encodeURIComponent(assetId)}/passport`;
}

/** A small passport booklet: a cover with a globe and a line for the name. */
function BookletIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 40"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="28" height="36" rx="3" />
      <path d="M6 2v36" opacity="0.5" />
      <circle cx="18" cy="17" r="7" />
      <path d="M11 17h14M18 10c2.5 2 2.5 12 0 14M18 10c-2.5 2-2.5 12 0 14" />
      <path d="M12 31h12" />
    </svg>
  );
}

type CardProps = {
  locale: string;
  assetId: string;
  title: string;
  text: string;
  className?: string;
};

/** A card dressed as a passport cover that opens the item's passport. */
export function PassportCard({ locale, assetId, title, text, className }: CardProps) {
  return (
    <Link
      href={passportHref(locale, assetId)}
      className={cx(
        'group flex items-center gap-4 rounded-xl bg-brand p-4 text-brand-contrast shadow-sm transition-colors hover:bg-brand-hover sm:p-5',
        className
      )}
    >
      <BookletIcon className="h-12 w-10 shrink-0 opacity-90" />
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-lg font-semibold">{title}</span>
        <span className="block text-sm opacity-85">{text}</span>
      </span>
      <span
        aria-hidden="true"
        className="text-2xl transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
      >
        →
      </span>
    </Link>
  );
}
