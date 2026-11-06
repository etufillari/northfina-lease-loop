// A link that looks like a button: for navigation, never for an action that changes data.
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button';
import { cx } from './cx';

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function LinkButton({ variant, size, className, ...rest }: LinkButtonProps) {
  return <Link className={cx(buttonClasses(variant, size), className)} {...rest} />;
}
