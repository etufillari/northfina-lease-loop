// The loop mark, drawn large and faint behind a dark "stage" panel's text.
export function HeroLoop({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className={`pointer-events-none absolute text-stage-accent opacity-15 ${className || '-right-16 -bottom-24 size-[26rem] sm:-right-8 sm:-bottom-16 sm:size-[30rem]'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13a9 9 0 0 1 15.5-4.5L26 11" />
      <path d="M26 5v6h-6" />
      <path d="M24 19a9 9 0 0 1-15.5 4.5L6 21" />
      <path d="M6 27v-6h6" />
    </svg>
  );
}
