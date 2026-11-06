'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animateInfinity } from './infinity-particles';

export function InfinityHero({
  children,
  pauseLabel,
  playLabel,
}: {
  children: ReactNode;
  pauseLabel: string;
  playLabel: string;
}) {
  const host = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const animation = useRef<ReturnType<typeof animateInfinity> | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!host.current || !canvas.current) return;
    const controller = animateInfinity(canvas.current, host.current);
    animation.current = controller;
    return () => controller.dispose();
  }, []);

  return (
    <header
      ref={host}
      className="relative isolate flex min-h-[580px] items-center justify-center overflow-hidden bg-white px-4 py-24 sm:min-h-[660px] sm:px-8"
    >
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_38%_35%_at_center,white_25%,transparent_100%)]" />
      <div className="relative z-10 mx-auto w-full max-w-[900px] text-center">{children}</div>
      <button
        type="button"
        onClick={() => {
          animation.current?.pause(!paused);
          setPaused(!paused);
        }}
        className="absolute right-2 bottom-2 z-10 inline-flex min-h-target items-center gap-2 rounded-pill bg-white/90 px-4 text-fine text-ink-muted motion-reduce:hidden"
      >
        <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
        {paused ? playLabel : pauseLabel}
      </button>
    </header>
  );
}
