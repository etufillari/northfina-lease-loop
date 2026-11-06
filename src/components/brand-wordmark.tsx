import { getImageProps } from 'next/image';

// Request a small optimized image while retaining the approved artwork's coordinates.
const { props: mark } = getImageProps({
  src: '/brand/lease-loop-infinity.png',
  width: 128,
  height: 72,
  alt: '',
});

/** Keep the translated brand name readable while replacing its "oo" with the infinity mark. */
export function BrandWordmark({ label, className = '' }: { label: string; className?: string }) {
  const position = label.indexOf('oo');
  const classes = `inline-flex shrink-0 items-baseline whitespace-nowrap font-semibold tracking-tight text-ink ${className}`;
  if (position < 0) return <span className={classes}>{label}</span>;

  return (
    <span className={classes}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        <span>{label.slice(0, position)}</span>
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="104 189 1450 635"
          className="mx-[0.01em] inline-block h-[0.6em] w-[1.38em] shrink-0 overflow-hidden"
        >
          <image href={mark.src} width="1672" height="941" />
        </svg>
        <span>{label.slice(position + 2)}</span>
      </span>
    </span>
  );
}
