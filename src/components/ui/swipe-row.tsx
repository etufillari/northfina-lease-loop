'use client';

// A horizontal row of cards you can swipe, scroll with a trackpad, or page with the arrow
// buttons. Scrolling is native (CSS scroll-snap); this component only drives the buttons.
import { useCallback, useEffect, useRef, useState } from 'react';

type SwipeRowProps = {
  headingId: string;
  title: string;
  subtitle: string;
  previousLabel: string;
  nextLabel: string;
  children: React.ReactNode;
};

export function SwipeRow({
  headingId,
  title,
  subtitle,
  previousLabel,
  nextLabel,
  children,
}: SwipeRowProps) {
  const rail = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  const page = (direction: -1 | 1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85 });
  };

  return (
    <section aria-labelledby={headingId} className="scroll-mt-24" id={`row-${headingId}`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            id={headingId}
            className="font-display text-lg font-bold tracking-tight uppercase sm:text-xl"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <ArrowButton label={previousLabel} disabled={atStart} onClick={() => page(-1)} flip />
          <ArrowButton label={nextLabel} disabled={atEnd} onClick={() => page(1)} />
        </div>
      </div>
      <ul ref={rail} onScroll={update} className={`rail ${atEnd ? '' : 'rail-fade'}`}>
        {children}
      </ul>
    </section>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  flip = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  flip?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full border border-line bg-surface text-fg transition hover:border-accent hover:text-accent-text disabled:cursor-default disabled:opacity-35 disabled:hover:border-line disabled:hover:text-fg"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={`size-4 ${flip ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3l5 5-5 5" />
      </svg>
    </button>
  );
}
