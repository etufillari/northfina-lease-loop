'use client';

import { useState } from 'react';
import type { EndOfTermChoice } from '@/domain/end-of-term-options';

type EndOfTermOptionsProps = {
  leaseId: string;
  choices: readonly EndOfTermChoice[];
  labels: {
    title: string;
    prompt: string;
    demoNote: string;
    selected: string;
    choices: Record<EndOfTermChoice, { title: string; description: string }>;
  };
};

export function EndOfTermOptions({ leaseId, choices, labels }: EndOfTermOptionsProps) {
  const [selectedChoice, setSelectedChoice] = useState<EndOfTermChoice | null>(null);

  return (
    <fieldset className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-700">
      <legend className="text-base font-semibold">{labels.title}</legend>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{labels.prompt}</p>
      <div className="mt-4 grid gap-3">
        {choices.map((choice) => {
          const isSelected = selectedChoice === choice;
          const label = labels.choices[choice];

          return (
            <label
              key={choice}
              className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
                isSelected
                  ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950'
                  : 'border-stone-200 hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-500'
              }`}
            >
              <input
                type="radio"
                name={`end-of-term-choice-${leaseId}`}
                value={choice}
                checked={isSelected}
                onChange={() => setSelectedChoice(choice)}
                className="mt-1 accent-emerald-700"
              />
              <span>
                <span className="block text-sm font-semibold">{label.title}</span>
                <span className="mt-1 block text-sm text-stone-600 dark:text-stone-400">
                  {label.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">
        {selectedChoice ? labels.selected : labels.demoNote}
      </p>
    </fieldset>
  );
}
