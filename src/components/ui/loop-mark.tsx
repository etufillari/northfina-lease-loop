// The Lease Loop logo: two arrows chasing each other (lease, return, lease again).

export function LoopMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className={`shrink-0 rounded-full bg-accent p-1.5 text-on-accent ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
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
