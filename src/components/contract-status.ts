// Shared by the contract page and the lease list.
export const statusClasses = {
  draft: 'bg-ink-100 text-ink-800 ring-ink-300 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-600',
  active:
    'bg-green-100 text-green-900 ring-green-300 dark:bg-green-950 dark:text-green-200 dark:ring-green-700',
  completed:
    'bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-700',
  terminated:
    'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-700',
} as const;

export function contractNumberFor(contractId: string): string {
  return `LL-${contractId.slice(0, 8).toUpperCase()}`;
}
