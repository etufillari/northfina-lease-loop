import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'cart'
  | 'account'
  | 'globe'
  | 'chevron'
  | 'arrow'
  | 'bike'
  | 'laptop'
  | 'tractor'
  | 'leases'
  | 'payments'
  | 'settings';

export function UiIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    cart: (
      <>
        <path d="m3 3 2 2 2 11h12l2-8H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    bike: (
      <>
        <circle cx="5.5" cy="16.5" r="4" />
        <circle cx="18.5" cy="16.5" r="4" />
        <path d="m5.5 16.5 5-9 5 9h-10L9 10h7m-2-6h3l2 12M8 7h5" />
      </>
    ),
    laptop: (
      <>
        <rect x="4" y="3" width="16" height="13" rx="1.5" />
        <path d="m4 16-2 5h20l-2-5M10 18h4" />
      </>
    ),
    tractor: (
      <>
        <circle cx="7" cy="17" r="4" />
        <circle cx="19" cy="18" r="3" />
        <path d="M4 13V5h8v9m-8-5h8l4 5h5v2M16 14V7m-5 13h5" />
      </>
    ),
    leases: (
      <>
        <rect x="4" y="6" width="16" height="15" rx="2" />
        <path d="M8 6V3h8v3M4 12h16m-11 0v3h6v-3" />
      </>
    ),
    payments: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </>
    ),
    settings: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" fill="currentColor" />
        <circle cx="16" cy="12" r="2" fill="currentColor" />
        <circle cx="10" cy="18" r="2" fill="currentColor" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
