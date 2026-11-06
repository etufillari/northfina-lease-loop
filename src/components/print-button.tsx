'use client';

/** Browsers save a printed page as a PDF, so this needs no PDF library or server rendering. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="pressable min-h-target rounded-pill bg-primary px-6 py-3 text-caption font-semibold text-white print:hidden"
    >
      {label}
    </button>
  );
}
