'use client';
import type { ReactNode } from 'react';
export function ConditionChoice({
  label,
  description,
  selected,
  onClick,
  children,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${selected ? 'border-primary bg-primary/5' : 'border-hairline bg-canvas'}`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className="flex min-h-target w-full items-center gap-3 text-left"
      >
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-white' : 'border-ink-muted'}`}
          aria-hidden="true"
        >
          {selected ? '✓' : ''}
        </span>
        <span>
          <span className="block font-semibold">{label}</span>
          {description ? (
            <span className="mt-1 block text-caption text-ink-muted">{description}</span>
          ) : null}
        </span>
      </button>
      {selected ? children : null}
    </div>
  );
}
