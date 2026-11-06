// Line art for the category cards. Decorative: the card's heading names the category.
// Strokes use currentColor, so the parent's text colour sets the colour in both themes.
import type { ReactNode } from 'react';
import type { AssetCategory } from '@/data/schemas';

const illustrations: Record<AssetCategory, ReactNode> = {
  e_bike: (
    <>
      <circle cx="58" cy="112" r="34" />
      <circle cx="182" cy="112" r="34" />
      <circle cx="58" cy="112" r="3" />
      <circle cx="182" cy="112" r="3" />
      <path d="M58 112h54l46-42M58 112l40-46 14 46M98 66l58-8" />
      <path d="M182 112 154 42h-8M154 42h18c7 0 9 5 8 10" />
      <path d="M98 66l-3-10M82 56h26" />
      <circle cx="112" cy="112" r="8" />
      <path d="M112 112l9 13h9" />
      <rect
        x="-20"
        y="-6"
        width="40"
        height="12"
        rx="3"
        transform="translate(136 84) rotate(-42)"
        fill="currentColor"
        fillOpacity="0.15"
      />
      <path d="M128 14l-11 17h12l-9 15" />
    </>
  ),
  laptop: (
    <>
      <rect x="56" y="24" width="128" height="90" rx="8" />
      <rect x="66" y="34" width="108" height="70" rx="3" />
      <path d="M56 114h128l22 20a3 3 0 0 1-2 5H36a3 3 0 0 1-2-5z" />
      <path d="M104 127h32" />
      <path d="M80 54h50M80 69h80M80 84h36" />
    </>
  ),
  farm_machine: (
    <>
      <circle cx="72" cy="112" r="36" />
      <circle cx="72" cy="112" r="16" />
      <circle cx="72" cy="112" r="4" />
      <circle cx="186" cy="126" r="22" />
      <circle cx="186" cy="126" r="9" />
      <path d="M26 110a46 46 0 0 1 92 0" />
      <path d="M72 64V32M60 32h74M128 32l14 46M84 44h38l8 26H84z" />
      <path d="M116 100h88V84a6 6 0 0 0-6-6h-98" />
      <path d="M108 122h56" />
      <path d="M176 78V46M171 46h10M190 86v6" />
    </>
  ),
};

export function CategoryIllustration({ category }: { category: AssetCategory }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 160"
      className="h-auto w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {illustrations[category]}
    </svg>
  );
}
