import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-6 py-12 text-center dark:border-stone-700 dark:bg-stone-900">
      <h2 className="text-lg font-semibold">{title}</h2>

      {description && (
        <p className="mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">{description}</p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
