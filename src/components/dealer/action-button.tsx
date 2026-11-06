'use client';

import { ActionError, buttonClass } from './action-error';
import { DEALER_ACTOR } from './constants';
import { useReturnAction, type ActionTexts } from './use-return-action';

/** The steps that need no input, only a confirmation: they are a POST with the actor. */
export type ConfirmStep = 'receive' | 'approve' | 'complete';

type Props = { returnId: string; step: ConfirmStep; label: string; texts: ActionTexts };

/**
 * One button for the three confirm-only steps: receive the item, approve the plan, complete the
 * work. Each calls its own route, which holds the rules.
 */
export function ActionButton({ returnId, step, label, texts }: Props) {
  const { pending, error, run } = useReturnAction(texts);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(`/api/returns/${returnId}/${step}`, { actor: DEALER_ACTOR })}
        className={buttonClass}
      >
        {pending ? texts.working : label}
      </button>
      <ActionError message={error} />
    </div>
  );
}
