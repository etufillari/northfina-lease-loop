'use client';

import { ActionError, buttonClass } from './action-error';
import { DEALER_ACTOR } from './constants';
import { useReturnAction, type ActionTexts } from './use-return-action';

type Props = {
  assetId: string;
  availableDate: string;
  usageSinceLastService?: number;
  label: string;
  texts: ActionTexts;
};

/**
 * Reserves the asset for the winner of the second-life decision. The server recalculates the
 * decision, so this sends only which asset and the date, never who should win.
 */
export function ReserveButton({
  assetId,
  availableDate,
  usageSinceLastService,
  label,
  texts,
}: Props) {
  const { pending, error, run } = useReturnAction(texts);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run('/api/second-life/reservations', {
            assetId,
            availableDate,
            actor: DEALER_ACTOR,
            ...(usageSinceLastService === undefined ? {} : { usageSinceLastService }),
          })
        }
        className={buttonClass}
      >
        {pending ? texts.working : label}
      </button>
      <ActionError message={error} />
    </div>
  );
}
