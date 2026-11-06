'use client';

import { useState, type FormEvent } from 'react';
import { ActionError, buttonClass, fieldClass } from './action-error';
import { DEALER_ACTOR } from './constants';
import { useReturnAction, type ActionTexts } from './use-return-action';

type Option = { value: string; label: string };

type Props = {
  returnId: string;
  /** Farm machines also record usage since the last service. */
  askServiceHistory: boolean;
  conditions: Option[];
  defaultCondition: string;
  usageLabel: string;
  defaultUsage: number;
  labels: {
    condition: string;
    serviceHistory: string;
    serviceHistoryHelp: string;
    save: string;
  };
  texts: ActionTexts;
};

/** Received → Inspected: condition, usage and (farm machines) service history. */
export function InspectionForm(props: Props) {
  const { returnId, askServiceHistory, conditions, labels, texts } = props;
  const { pending, error, run } = useReturnAction(texts);
  const [condition, setCondition] = useState(props.defaultCondition);
  const [usage, setUsage] = useState(String(props.defaultUsage));
  const [sinceService, setSinceService] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    run(`/api/returns/${returnId}/inspect`, {
      condition,
      usageValue: Number(usage),
      // Left out (not 0) when empty, so the server can ask for it on a farm machine.
      ...(askServiceHistory && sinceService !== ''
        ? { usageSinceLastService: Number(sinceService) }
        : {}),
      actor: DEALER_ACTOR,
    });
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-4">
      <label className="text-sm font-medium">
        {labels.condition}
        <select
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          className={fieldClass}
        >
          {conditions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-medium">
        {props.usageLabel}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          required
          value={usage}
          onChange={(event) => setUsage(event.target.value)}
          className={fieldClass}
        />
      </label>

      {askServiceHistory ? (
        <div>
          <label className="text-sm font-medium">
            {labels.serviceHistory}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required
              aria-describedby="service-history-help"
              value={sinceService}
              onChange={(event) => setSinceService(event.target.value)}
              className={fieldClass}
            />
          </label>
          <p id="service-history-help" className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            {labels.serviceHistoryHelp}
          </p>
        </div>
      ) : null}

      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? texts.working : labels.save}
        </button>
        <ActionError message={error} />
      </div>
    </form>
  );
}
