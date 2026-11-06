// A drawn picture of an item, since the data pack has no photos. One flat style for all:
// forest outlines, a terracotta part, a dashed ground line and a low sun. The model name picks
// the variant (a cargo bike looks like a cargo bike), so a row of twelve e-bikes is not twelve
// copies of one drawing. Purely decorative: the item's name is always in the text beside it.
import type { ReactNode } from 'react';
import type { AssetCategory } from '@/data/schemas';
import { cx } from './ui';

export type ArtKind =
  | 'city'
  | 'step'
  | 'trail'
  | 'cargo'
  | 'fold'
  | 'kids'
  | 'laptop'
  | 'laptopSmall'
  | 'laptopGamer'
  | 'tractor'
  | 'combine'
  | 'implement'
  | 'milker';

const RULES: Record<AssetCategory, [RegExp, ArtKind][]> = {
  e_bike: [
    [/cargo|delivery/i, 'cargo'],
    [/fold/i, 'fold'],
    [/kids/i, 'kids'],
    [/step/i, 'step'],
    [/trail|gravel/i, 'trail'],
  ],
  laptop: [
    [/gamer/i, 'laptopGamer'],
    [/edu|air|11/i, 'laptopSmall'],
  ],
  farm_machine: [
    [/combine/i, 'combine'],
    [/milker/i, 'milker'],
    [/tractor/i, 'tractor'],
  ],
};

const FALLBACK: Record<AssetCategory, ArtKind> = {
  e_bike: 'city',
  laptop: 'laptop',
  farm_machine: 'implement',
};

/** The drawing for an item: the first rule whose pattern matches the model wins. */
export function artKindFor(category: AssetCategory, model: string): ArtKind {
  return RULES[category].find(([pattern]) => pattern.test(model))?.[1] ?? FALLBACK[category];
}

type ItemArtProps = {
  category: AssetCategory;
  model: string;
  className?: string;
};

export function ItemArt({ category, model, className }: ItemArtProps) {
  const kind = artKindFor(category, model);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 120"
      className={cx('h-auto w-full', className)}
      fill="none"
      stroke="var(--brand)"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="168" cy="22" r="11" fill="var(--accent)" stroke="none" opacity="0.9" />
      <path d="M12 108H188" stroke="var(--line-strong)" strokeWidth="3" strokeDasharray="8 7" />
      {DRAWINGS[kind]}
    </svg>
  );
}

const TERRA = { fill: 'var(--accent)', stroke: 'none' } as const;

function Bike({ wheel = 22, tyre = 6 }: { wheel?: number; tyre?: number }) {
  return (
    <>
      <circle cx="55" cy="82" r={wheel} strokeWidth={tyre} />
      <circle cx="145" cy="82" r={wheel} strokeWidth={tyre} />
      <path d="M55 82 L84 46 H128 L145 82 M84 46 L100 82 L128 46 M84 46 L79 32 M70 31 H88 M128 46 L124 30 H138" />
      <rect x="92" y="52" width="24" height="10" rx="4" {...TERRA} />
    </>
  );
}

const DRAWINGS: Record<ArtKind, ReactNode> = {
  city: <Bike />,
  trail: (
    <>
      <Bike tyre={9} />
      <path d="M128 46 L140 68" strokeWidth="4" />
    </>
  ),
  step: (
    <>
      <circle cx="55" cy="82" r="22" />
      <circle cx="145" cy="82" r="22" />
      <path d="M55 82 L82 48 M82 48 Q90 84 104 82 L128 46 L145 82 M82 48 L78 32 M68 31 H86 M128 46 L124 30 H138" />
      <rect x="62" y="60" width="22" height="10" rx="4" {...TERRA} />
    </>
  ),
  cargo: (
    <>
      <circle cx="46" cy="84" r="20" />
      <circle cx="160" cy="90" r="14" />
      <path d="M46 84 L70 50 H104 L118 84 L46 84 M70 50 L66 36 M58 35 H74 M104 50 L100 34 H114 M118 84 H160" />
      <rect x="124" y="54" width="52" height="24" rx="4" {...TERRA} />
      <path d="M124 78 H176" strokeWidth="4" />
    </>
  ),
  fold: (
    <>
      <circle cx="68" cy="90" r="15" />
      <circle cx="132" cy="90" r="15" />
      <path d="M68 90 L100 64 L132 90 M100 64 L104 34 H118 M100 64 L86 52 M78 50 H94" />
      <rect x="92" y="70" width="18" height="9" rx="3" {...TERRA} />
    </>
  ),
  kids: (
    <g transform="translate(30 30) scale(0.72)">
      <Bike />
    </g>
  ),
  laptop: (
    <>
      <rect x="54" y="26" width="92" height="62" rx="6" />
      <path d="M36 98 H164 L156 90 H44 Z" fill="var(--brand)" />
      <path d="M70 66 C82 46 94 46 100 58 S118 72 130 48" stroke="var(--accent)" strokeWidth="5" />
    </>
  ),
  laptopSmall: (
    <>
      <rect x="66" y="38" width="68" height="50" rx="6" />
      <path d="M52 98 H148 L142 90 H58 Z" fill="var(--brand)" />
      <circle cx="100" cy="62" r="11" {...TERRA} />
    </>
  ),
  laptopGamer: (
    <>
      <rect x="40" y="20" width="120" height="70" rx="6" />
      <path d="M24 100 H176 L166 92 H34 Z" fill="var(--brand)" />
      <path d="M58 72 L80 44 L96 62 L112 36 L142 72" stroke="var(--accent)" strokeWidth="5" />
      <path d="M44 96 H156" stroke="var(--accent)" strokeWidth="2" />
    </>
  ),
  tractor: (
    <>
      <rect x="92" y="50" width="62" height="30" rx="5" {...TERRA} />
      <rect x="62" y="26" width="38" height="36" rx="4" />
      <path d="M140 50 V34" />
      <circle cx="76" cy="82" r="22" fill="var(--brand)" />
      <circle cx="76" cy="82" r="8" fill="var(--raised)" stroke="none" />
      <circle cx="148" cy="92" r="13" fill="var(--brand)" />
      <circle cx="148" cy="92" r="5" fill="var(--raised)" stroke="none" />
    </>
  ),
  combine: (
    <>
      <rect x="50" y="40" width="86" height="44" rx="6" {...TERRA} />
      <rect x="62" y="20" width="34" height="28" rx="4" />
      <path d="M136 72 H176 V58 H136 M150 58 V72 M164 58 V72 M50 52 L30 36" />
      <circle cx="74" cy="90" r="16" fill="var(--brand)" />
      <circle cx="124" cy="94" r="11" fill="var(--brand)" />
    </>
  ),
  implement: (
    <>
      <path d="M20 70 H52" />
      <rect x="52" y="52" width="104" height="30" rx="5" {...TERRA} />
      <path d="M62 82 V94 M84 82 V94 M106 82 V94 M128 82 V94 M150 82 V94" strokeWidth="5" />
      <circle cx="76" cy="96" r="9" fill="var(--brand)" />
      <circle cx="136" cy="96" r="9" fill="var(--brand)" />
      <path d="M60 52 V40 H148 V52" />
    </>
  ),
  milker: (
    <>
      <rect x="40" y="30" width="56" height="70" rx="6" />
      <rect x="50" y="42" width="36" height="16" rx="3" {...TERRA} />
      <path d="M96 56 H128 L148 74 M148 74 V92 M140 92 H156" />
      <circle cx="128" cy="56" r="6" fill="var(--brand)" />
      <path d="M50 72 H86 M50 84 H86" strokeWidth="4" />
    </>
  ),
};
