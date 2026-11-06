import type { ReactNode } from 'react';

type ErrorStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function ErrorState({ title, description, action }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center dark:border-red-900/50 dark:bg-red-950/20"
    >
      <h2 className="text-lg font-semibold text-red-800 dark:text-red-300">{title}</h2>

      {description && (
        <p className="mt-2 max-w-md text-sm text-red-700 dark:text-red-400">{description}</p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
