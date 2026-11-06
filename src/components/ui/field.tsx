// A form field: label, optional hint and error, and the control. The control gets its
// accessibility wiring from the render prop, so the hint and the error are announced:
//
//   <Field id="as-of" label={t('demo.date')} hint={t('demo.dateHint')}>
//     {(control) => <input type="date" className={inputClasses} {...control} />}
//   </Field>
import type { ReactNode } from 'react';
import { cx } from './cx';

export type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
};

type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/** The look of a text input, date input or select inside a Field. */
export const inputClasses =
  'block min-h-11 w-full rounded-md border-2 border-neutral-solid bg-raised px-3 py-2 text-base text-ink ' +
  'aria-invalid:border-danger-solid';

export function Field({ id, label, hint, error, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
