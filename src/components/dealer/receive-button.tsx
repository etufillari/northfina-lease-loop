'use client';

import { ActionError, buttonClass } from './action-error';
import { DEALER_ACTOR } from './constants';
import { useReturnAction, type ActionTexts } from './use-return-action';

type Props = { returnId: string; label: string; texts: ActionTexts };

/** Requested → Received: the dealer confirms the item is physically here. */
export function ReceiveButton({ returnId, label, texts }: Props) {
  const { pending, error, run } = useReturnAction(texts);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(`/api/returns/${returnId}/receive`, { actor: DEALER_ACTOR })}
        className={buttonClass}
      >
        {pending ? texts.working : label}
      </button>
      <ActionError message={error} />
    </div>
  );
}
