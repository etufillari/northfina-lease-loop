import type { AssetCategory } from '@/data/schemas';

/** Category-specific line art. Decorative only: product details remain in text. */
export function AssetArt({ category }: { category: AssetCategory }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="asset-art"
      viewBox="0 0 320 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="160"
        cy="100"
        r="82"
        stroke="currentColor"
        strokeOpacity=".18"
        strokeWidth="1.5"
      />
      <circle
        cx="160"
        cy="100"
        r="112"
        stroke="currentColor"
        strokeOpacity=".09"
        strokeWidth="1.5"
      />
      {category === 'e_bike' ? (
        <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="75" cy="140" r="35" />
          <circle cx="245" cy="140" r="35" />
          <path d="m75 140 58-73 51 73H75Zm58-73 41-12m-14-11h34m-10 96 61-65m-14-8h27m-123 0-13-24h-20" />
          <circle cx="184" cy="140" r="8" fill="currentColor" stroke="none" />
        </g>
      ) : category === 'laptop' ? (
        <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="65" y="46" width="190" height="112" rx="12" />
          <path d="M44 164h232l-12 13H56l-12-13Z" />
          <path d="M88 138h144" opacity=".35" />
          <path d="m145 100 14 14 29-33" strokeWidth="7" />
        </g>
      ) : (
        <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M46 131h30l23-35h70l16 35h84v-30h-42l-19-30h-37V40h-48v54" />
          <path d="M123 43v51h48m-72 3h-12l-19 34m130 0h52m-75-62h29m-4 3v28" />
          <circle cx="104" cy="143" r="30" />
          <circle cx="232" cy="148" r="23" />
          <circle cx="104" cy="143" r="9" />
          <circle cx="232" cy="148" r="7" />
        </g>
      )}
    </svg>
  );
}
