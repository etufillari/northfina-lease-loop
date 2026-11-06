'use client';

// The demo clock controls: a date field, quick jumps and a reset. Each posts to
// POST /api/demo/clock, which sets the cookie, then re-renders the server pages.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Notice, inputClasses } from '@/components/ui';

export type ClockFormLabels = {
  date: string;
  dateHint: string;
  travel: string;
  presets: string;
  reset: string;
  pending: string;
  error: string;
};

type ClockFormProps = {
  today: string;
  overridden: boolean;
  /** Quick jumps: the ISO day and its label in the page's language. */
  presets: Array<{ iso: string; label: string }>;
  labels: ClockFormLabels;
};

export function ClockForm({ today, overridden, presets, labels }: ClockFormProps) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function move(asOf: string | null, which: string) {
    setPending(which);
    setFailed(false);
    try {
      const response = await fetch('/api/demo/clock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ asOf }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = (await response.json()) as { data: { today: string } };
      setDate(body.data.today);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void move(date, 'travel');
        }}
      >
        <Field
          id="demo-as-of"
          label={labels.date}
          hint={labels.dateHint}
          className="w-full sm:w-64"
        >
          {(control) => (
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={inputClasses}
              {...control}
            />
          )}
        </Field>
        <Button type="submit" pending={pending === 'travel'} pendingLabel={labels.pending}>
          {labels.travel}
        </Button>
      </form>

      <fieldset>
        <legend className="mb-2 font-medium">{labels.presets}</legend>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.iso}
              variant="secondary"
              size="sm"
              pending={pending === preset.iso}
              aria-pressed={overridden && today === preset.iso}
              onClick={() => void move(preset.iso, preset.iso)}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            disabled={!overridden}
            pending={pending === 'reset'}
            onClick={() => void move(null, 'reset')}
          >
            {labels.reset}
          </Button>
        </div>
      </fieldset>

      {failed ? (
        <Notice tone="error" live>
          {labels.error}
        </Notice>
      ) : null}
    </div>
  );
}
