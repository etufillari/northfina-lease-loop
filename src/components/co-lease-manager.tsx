'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { maxCoLeaseParticipants, shareProblem, splitCents } from '@/domain/co-lease';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { PersonAvatar } from './person-avatar';

type Person = { id: string; name: string };
type Row = Person & { percent: string };

export function CoLeaseManager({
  locale,
  leaseId,
  holder,
  current,
  candidates,
  nextPaymentCents,
}: {
  locale: Locale;
  leaseId: string;
  holder: Person;
  current: (Person & { percent: number })[];
  candidates: Person[];
  nextPaymentCents: number | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    current.length
      ? current.map((row) => ({ ...row, percent: String(row.percent) }))
      : [{ ...holder, percent: '100' }]
  );
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);

  const percents = rows.map((row) => Number(row.percent));
  const total = percents.reduce((sum, percent) => sum + (percent || 0), 0);
  const valid =
    shareProblem(
      rows.map((row, index) => ({
        userId: row.id,
        percent: percents[index]!,
        isHolder: row.id === holder.id,
      }))
    ) === null;
  const amounts =
    valid && nextPaymentCents !== null ? splitCents(nextPaymentCents, percents) : null;
  const available = candidates.filter((candidate) => !rows.some((row) => row.id === candidate.id));

  function change(next: Row[]) {
    setRows(next);
    setState('idle');
  }
  async function save() {
    setBusy(true);
    setState('idle');
    try {
      const response = await fetch(`/api/leases/${encodeURIComponent(leaseId)}/co-lease`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shares: rows.map((row, index) => ({ userId: row.id, percent: percents[index] })),
        }),
      });
      if (!response.ok) {
        setState('error');
        return;
      }
      setState('saved');
      router.refresh();
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 max-w-3xl">
      <p className="text-body text-ink-muted">{t('colease.intro')}</p>
      <p className="mt-2 text-caption text-ink-muted">{t('colease.demoNote')}</p>
      {nextPaymentCents !== null ? (
        <p className="mt-5 text-caption text-ink-muted">
          {t('colease.nextTotal')}:{' '}
          <strong className="font-semibold text-ink">{money(nextPaymentCents)}</strong>
        </p>
      ) : null}

      <h3 className="mt-6 text-body font-semibold">{t('colease.people')}</h3>
      <ul className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <li key={row.id} className="rounded-lg border border-hairline bg-canvas p-5">
            <div className="flex flex-wrap items-center gap-4">
              <PersonAvatar id={row.id} name={row.name} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="font-semibold wrap-anywhere">
                  {row.name}
                  {row.id === holder.id ? (
                    <span className="font-normal text-ink-muted"> · {t('colease.you')}</span>
                  ) : null}
                </p>
                {amounts ? (
                  <p className="mt-1 text-caption text-ink-muted">
                    {t('colease.nextAmount', { amount: money(amounts[index]!) })}
                  </p>
                ) : null}
              </div>
              <label className="w-40 text-caption">
                {t('colease.percent')}
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  step={1}
                  value={row.percent}
                  disabled={busy}
                  onChange={(event) =>
                    change(
                      rows.map((item) =>
                        item.id === row.id ? { ...item, percent: event.target.value } : item
                      )
                    )
                  }
                  className="mt-1 min-h-target w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-body"
                />
              </label>
              {row.id !== holder.id ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => change(rows.filter((item) => item.id !== row.id))}
                  className="min-h-target text-caption text-primary underline"
                >
                  {t('colease.remove')}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p
        aria-live="polite"
        className={`mt-4 text-caption ${valid ? 'text-ink-muted' : 'font-semibold'}`}
      >
        {t('colease.total', { total })}
        {valid ? '' : ` ${t('colease.mustTotal')}`}
      </p>
      {state === 'saved' ? (
        <p role="status" className="mt-3 rounded-sm bg-parchment p-3 text-caption">
          {t('colease.saved')}
        </p>
      ) : null}
      {state === 'error' ? (
        <p role="alert" className="mt-3 rounded-sm bg-parchment p-3 text-caption font-semibold">
          {t('colease.error')}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || !valid}
        onClick={() => void save()}
        className="pressable mt-4 min-h-target rounded-pill bg-primary px-6 py-3 text-caption font-semibold text-white disabled:opacity-50"
      >
        {t(busy ? 'auth.working' : 'colease.save')}
      </button>

      <h3 className="mt-8 text-body font-semibold">{t('colease.add')}</h3>
      {candidates.length ? (
        <ul className="mt-3 grid gap-3 grid:grid-cols-2">
          {available.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-lg border border-hairline bg-canvas p-4"
            >
              <PersonAvatar id={person.id} name={person.name} />
              <p className="min-w-0 flex-1 font-semibold wrap-anywhere">{person.name}</p>
              <button
                type="button"
                disabled={busy || rows.length >= maxCoLeaseParticipants}
                onClick={() => change([...rows, { ...person, percent: '' }])}
                className="pressable min-h-target rounded-pill border border-primary px-4 py-2 text-caption text-primary disabled:opacity-50"
              >
                {t('colease.addPerson')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-caption text-ink-muted">{t('colease.noCandidates')}</p>
      )}
    </div>
  );
}
