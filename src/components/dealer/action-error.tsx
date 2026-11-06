// The error line under an action. `role="alert"` makes screen readers announce it.
export function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200 ring-inset dark:bg-red-950 dark:text-red-200 dark:ring-red-800"
    >
      {message}
    </p>
  );
}

export const buttonClass =
  'inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60';

export const fieldClass =
  'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950';
