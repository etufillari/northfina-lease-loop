// A small line icon per browse category, for the catalogue's left panel. Decorative: the label
// beside it names the category.
import type { BrowseCategory } from '@/domain/catalogue-filter';

const paths: Record<BrowseCategory | 'all', React.ReactNode> = {
  all: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  car: (
    <>
      <path d="M5 16v-3l2-5h10l2 5v3" />
      <path d="M3 16h18v2H3z" />
      <circle cx="7.5" cy="18.5" r="1.5" />
      <circle cx="16.5" cy="18.5" r="1.5" />
    </>
  ),
  office_equipment: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="7" rx="1.5" />
      <path d="M7 14h10v6H7z" />
    </>
  ),
  laptop: (
    <>
      <rect x="5" y="5" width="14" height="10" rx="1.5" />
      <path d="M3 19h18" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  furniture: (
    <>
      <path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" />
      <path d="M4 11h16v4H4z" />
      <path d="M6 15v5M18 15v5" />
    </>
  ),
  e_bike: (
    <>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l4-7h6l2 7M10 9l3 7h-7M15 6h2" />
    </>
  ),
  farm_machine: (
    <>
      <circle cx="7" cy="16" r="4" />
      <circle cx="18" cy="18" r="2" />
      <path d="M7 12V7h6l2 5h4v6M11 16h5" />
    </>
  ),
};

export function CategoryIcon({
  category,
  className = 'size-4',
}: {
  category: BrowseCategory | 'all';
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[category]}
    </svg>
  );
}
