// The bell in the header: how many things need the viewer (ended leases, items passed on to
// them, unpaid invoices). It links to the notifications page. The count is worked out on the
// server for the viewer and the app's date.
import Link from 'next/link';

type InvoiceBellProps = { count: number; href: string; label: string };

export function InvoiceBell({ count, href, label }: InvoiceBellProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative rounded-lg p-2 text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
