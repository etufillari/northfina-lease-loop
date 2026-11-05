// The picture slot for an item: a category-coloured tile with a line drawing. It stands in for
// product photos, so every card in a row has the same shape and weight.
import type { AssetCategory } from '@/data/schemas';

const tiles: Record<AssetCategory, string> = {
  e_bike: 'bg-tile-e-bike',
  laptop: 'bg-tile-laptop',
  farm_machine: 'bg-tile-farm-machine',
};

export function CategoryArt({
  category,
  className = '',
  children,
}: {
  category: AssetCategory;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative grid place-items-center overflow-hidden text-tile-ink ${tiles[category]} ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 120 80"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3/4 opacity-85 transition-transform duration-500 ease-out group-hover:scale-105"
      >
        {drawings[category]}
      </svg>
      {children}
    </div>
  );
}

const drawings: Record<AssetCategory, React.ReactNode> = {
  e_bike: (
    <>
      <circle cx="26" cy="54" r="18" />
      <circle cx="94" cy="54" r="18" />
      <circle cx="26" cy="54" r="2" />
      <circle cx="94" cy="54" r="2" />
      <path d="M26 54l20-30h30l18 30M46 24l14 30h12l16-30M54 18h14M76 24l6-10h8" />
      <rect x="48" y="30" width="14" height="8" rx="2" />
    </>
  ),
  laptop: (
    <>
      <rect x="22" y="10" width="76" height="48" rx="4" />
      <path d="M10 64h100l-6 8H16zM52 68h16" />
      <path d="M34 24h30M34 33h44M34 42h22" />
    </>
  ),
  farm_machine: (
    <>
      <circle cx="34" cy="56" r="18" />
      <circle cx="34" cy="56" r="6" />
      <circle cx="96" cy="62" r="10" />
      <path d="M18 38V18h28l8 20h40v14H86M52 56h34M54 38V24M22 18v20M100 38V22" />
    </>
  ),
};
