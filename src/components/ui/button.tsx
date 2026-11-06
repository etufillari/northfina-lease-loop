// A button in the palette. No hooks, so it works in server and client components alike;
// a client parent passes `onClick` and `pending`.
import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'onDark';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-contrast hover:bg-brand-hover',
  secondary: 'border-2 border-brand bg-transparent text-brand-text hover:bg-brand-soft',
  danger: 'bg-danger-solid text-raised hover:bg-danger-hover',
  /** On a dark strip (the staff strip): outlined in the strip's own text colour. */
  onDark: 'border-2 border-current/60 bg-transparent text-current hover:bg-staff-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-4 text-sm',
  md: 'min-h-11 px-5 text-base',
  lg: 'min-h-13 px-7 text-lg',
};

/** The classes of a button, shared with LinkButton so a link can look like one. */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return cx(
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-bold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size]
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** While true the button is disabled, says `aria-busy` and shows a spinner. */
  pending?: boolean;
  /** Replaces the label while pending, e.g. "Saving…". */
  pendingLabel?: string;
};

export function Button({
  variant,
  size,
  pending = false,
  pendingLabel,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cx(buttonClasses(variant, size), className)}
      {...rest}
    >
      {pending ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
