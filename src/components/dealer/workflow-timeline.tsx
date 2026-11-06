// The four workflow steps with their state. Pure display: the states come from
// returnTimeline() in src/domain/return-workflow.ts.
import type { TimelineEntry, WorkflowStep } from '@/domain/return-workflow';
import type { Translate } from '@/i18n/get-t';

type Props = {
  entries: TimelineEntry[];
  /** Extra line under a step, e.g. who recorded it and when. */
  notes: Partial<Record<WorkflowStep, string>>;
  t: Translate;
};

const marker = {
  done: 'bg-emerald-700 text-white',
  current:
    'bg-white text-emerald-800 ring-2 ring-emerald-700 dark:bg-stone-950 dark:text-emerald-300',
  upcoming: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
} as const;

export function WorkflowTimeline({ entries, notes, t }: Props) {
  return (
    <ol aria-label={t('dealer.timeline.title')} className="grid gap-4 sm:grid-cols-4">
      {entries.map((entry, index) => (
        <li
          key={entry.step}
          aria-current={entry.state === 'current' ? 'step' : undefined}
          className="flex gap-3 sm:block"
        >
          <span
            aria-hidden="true"
            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${marker[entry.state]}`}
          >
            {entry.state === 'done' ? '✓' : index + 1}
          </span>
          <div className="sm:mt-2">
            <p className="font-medium">{t(`dealer.status.${entry.step}`)}</p>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              <span className="sr-only">{t(`dealer.timeline.${entry.state}`)}. </span>
              {notes[entry.step] ?? ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
