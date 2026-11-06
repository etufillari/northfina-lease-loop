'use client';
import { formatEuro } from '@/domain/money';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkPlan } from '@/domain/circular/refurbishment';
export function CircularActions({
  assetId,
  leaseId,
  receivedOn,
  receipt,
  condition,
  usage,
  labels,
  moneyLocale,
  grades,
  workNames,
}: {
  moneyLocale: string;
  grades: Record<string, string>;
  workNames: Record<string, string>;
  assetId: string;
  leaseId: string | null;
  receivedOn: string;
  receipt: { id: string; status: string; planJson: string | null; receivedOn: string } | null;
  condition: string;
  usage: number;
  labels: {
    receive: string;
    inspect: string;
    finish: string;
    condition: string;
    usage: string;
    confirm: string;
    busy: string;
    error: string;
    conflict: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState(condition);
  const [value, setValue] = useState(usage);
  const [checked, setChecked] = useState<string[]>([]);
  const plan: WorkPlan | null = receipt?.planJson ? JSON.parse(receipt.planJson) : null;
  async function send(input: Record<string, unknown>, key: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/circular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        setError(response.status === 409 ? labels.conflict : labels.error);
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }
  const button = 'rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-50';
  return (
    <div className="mt-4 space-y-3">
      {!receipt && (
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void send(
              { action: 'receive', assetId, ...(leaseId ? { leaseId } : {}), receivedOn },
              `receive:${leaseId ?? assetId}`
            )
          }
        >
          {busy ? labels.busy : labels.receive}
        </button>
      )}
      {receipt?.status === 'RECEIVED' && (
        <>
          <label className="block">
            {labels.condition}
            <select
              className="ml-3 rounded border p-2"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              {['new', 'like_new', 'good', 'fair', 'poor'].map((v) => (
                <option key={v} value={v}>
                  {grades[v] ?? v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {labels.usage}
            <input
              className="ml-3 w-32 rounded border p-2"
              type="number"
              min={usage}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </label>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              void send(
                { action: 'inspect', returnId: receipt.id, condition: grade, usageValue: value },
                `inspect:${receipt.id}:${grade}:${value}`
              )
            }
          >
            {busy ? labels.busy : labels.inspect}
          </button>
        </>
      )}
      {receipt?.status === 'INSPECTED' && plan && (
        <>
          <p className="text-sm">{labels.confirm}</p>
          {plan.steps.map((step) => (
            <label key={step.id} className="block text-sm">
              <input
                type="checkbox"
                className="mr-2"
                checked={checked.includes(step.id)}
                onChange={(e) =>
                  setChecked(
                    e.target.checked
                      ? [...checked, step.id]
                      : checked.filter((id) => id !== step.id)
                  )
                }
              />
              {workNames[step.id] ?? step.id} ({formatEuro(step.costCents, moneyLocale)})
            </label>
          ))}
          <button
            className={button}
            disabled={busy || checked.length !== plan.steps.length}
            onClick={() =>
              void send(
                {
                  action: 'finish',
                  returnId: receipt.id,
                  completedWorkIds: checked,
                  completedOn: receipt.receivedOn,
                },
                `finish:${receipt.id}`
              )
            }
          >
            {busy ? labels.busy : labels.finish}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
