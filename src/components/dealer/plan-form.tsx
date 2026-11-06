'use client';

import { useState, type FormEvent } from 'react';
import { ActionError, buttonClass, fieldClass } from './action-error';
import { DEALER_ACTOR } from './constants';
import { useReturnAction, type ActionTexts } from './use-return-action';

type Props = {
  returnId: string;
  /** Only conditions at or above the inspected one, in order. */
  targets: { value: string; label: string }[];
  defaultTarget: string;
  labels: { target: string; create: string };
  texts: ActionTexts;
};

/** Inspected → Plan created. The server calculates the work and cost; this only asks the target. */
export function PlanForm({ returnId, targets, defaultTarget, labels, texts }: Props) {
  const { pending, error, run } = useReturnAction(texts);
  const [target, setTarget] = useState(defaultTarget);

  function submit(event: FormEvent) {
    event.preventDefault();
    run(`/api/returns/${returnId}/plan`, { targetCondition: target, actor: DEALER_ACTOR });
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-4">
      <label className="text-sm font-medium">
        {labels.target}
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className={fieldClass}
        >
          {targets.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? texts.working : labels.create}
        </button>
        <ActionError message={error} />
      </div>
    </form>
  );
}
