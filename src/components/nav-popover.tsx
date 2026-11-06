'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function NavPopover({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<'hover' | 'click' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  function show(mode: 'hover' | 'click') {
    window.dispatchEvent(new CustomEvent('lease-loop-nav-open', { detail: id }));
    setOpen(mode);
  }
  useEffect(() => {
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setOpen(null);
    };
    window.addEventListener('lease-loop-nav-open', closeOther);
    return () => window.removeEventListener('lease-loop-nav-open', closeOther);
  }, [id]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div
      ref={root}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' && !open) show('hover');
      }}
      onPointerLeave={() => {
        if (open === 'hover') setOpen(null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(null);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={Boolean(open)}
        aria-controls={id}
        onClick={() => (open === 'click' ? setOpen(null) : show('click'))}
        className={`pressable flex min-h-target min-w-target items-center justify-center gap-1.5 rounded-pill px-3 text-ink hover:bg-parchment focus-visible:bg-parchment ${open ? 'bg-parchment' : ''}`}
      >
        {trigger}
      </button>
      {open ? (
        <div id={id} className="absolute right-0 top-full z-30 w-60 pt-3">
          <div
            className="rounded-lg border border-hairline bg-canvas p-2 shadow-lg"
            onClick={(event) => {
              if ((event.target as Element).closest('a')) setOpen(null);
            }}
          >
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
