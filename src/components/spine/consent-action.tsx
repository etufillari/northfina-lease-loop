'use client';

import { useId, useState } from 'react';
import { buttonClass } from './ui';

/**
 * Render this child with key={theExactReviewContext}.
 * A changed key remounts ONLY this checkbox/action, not the surrounding form inputs.
 */
export function ConsentAction({
  label,
  actionLabel,
  busy,
  disabled = false,
  onConfirm,
}: {
  label: string;
  actionLabel: string;
  busy: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const id = useId();
  const [accepted, setAccepted] = useState(false);
  return (
    <div className="space-y-4">
      <label htmlFor={id} className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-1"
          checked={accepted}
          disabled={busy || disabled}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      <button
        type="button"
        className={buttonClass}
        disabled={!accepted || busy || disabled}
        onClick={() => {
          if (accepted && !busy && !disabled) onConfirm();
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
