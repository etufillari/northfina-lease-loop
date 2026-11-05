'use client';

// Opens the browser's print dialog, where "Save as PDF" turns the contract into a PDF file.
// No PDF library needed: the print styles hide everything except the contract.
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none print:hidden"
    >
      {label}
    </button>
  );
}
