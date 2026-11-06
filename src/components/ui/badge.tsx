import type { HTMLAttributes } from 'react';

const badgeVariants = {
  success: {
    badge:
      'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
  },
  warning: {
    badge:
      'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  info: {
    badge:
      'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    dot: 'bg-sky-600 dark:bg-sky-400',
  },
  neutral: {
    badge:
      'bg-stone-100 text-stone-800 ring-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700',
    dot: 'bg-stone-500 dark:bg-stone-400',
  },
} as const;

export type BadgeVariant = keyof typeof badgeVariants;

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  dot?: boolean;
};

export function Badge({
  variant = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const styles = badgeVariants[variant];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles.badge} ${className ?? ''}`}
      {...props}
    >
      {dot && <span aria-hidden="true" className={`size-1.5 rounded-full ${styles.dot}`} />}
      {children}
    </span>
  );
}
