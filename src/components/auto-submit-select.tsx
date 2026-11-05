'use client';

// A <select> that submits its form as soon as the choice changes, so sorting feels instant.
// Without JavaScript it is a plain select and the form's Apply button still works.
import type { ComponentProps } from 'react';

export function AutoSubmitSelect(props: Omit<ComponentProps<'select'>, 'onChange'>) {
  return <select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
