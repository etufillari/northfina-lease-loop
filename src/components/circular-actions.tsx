'use client';

import { formatEuro } from '@/domain/money';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkPlan } from '@/domain/circular/refurbishment';

type Receipt = {
  id: string;
  status: string;
  planJson: string | null;
  receivedOn: string | null;
  requestedOn: string | null;
  reviewReason: string | null;
  offerNetCents: number | null;
};

export function CircularActions({
  assetId,
  leaseId,
  receivedOn,
  currentDate,
  receipt,
  condition,
  usage,
  usageUnit,
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
  currentDate: string;
  receipt: Receipt | null;
  condition: string;
  usage: number;
  usageUnit: string;
  labels: {
    receive: string;
    confirmReceipt: string;
    inspect: string;
    finish: string;
    approve: string;
    reject: string;
    rejectReason: string;
    pendingApproval: string;
    rejected: string;
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
  const [reason, setReason] = useState('');
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
          type="button"
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
      {receipt?.status === 'REQUESTED' && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() =>
            void send(
              { action: 'receive', returnId: receipt.id, receivedOn: currentDate },
              `receive:${receipt.id}`
            )
          }
        >
          {busy ? labels.busy : labels.confirmReceipt}
        </button>
      )}
      {receipt?.status === 'RECEIVED' && (
        <>
          <label className="block">
            {labels.condition}
            <select
              className="ml-3 rounded border p-2"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
            >
              {['new', 'like_new', 'good', 'fair', 'poor'].map((value) => (
                <option key={value} value={value}>
                  {grades[value] ?? value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {labels.usage}
            <span className="ml-2 text-sm text-stone-600 dark:text-stone-400">{usageUnit}</span>
            <input
              className="ml-3 w-32 rounded border p-2"
              type="number"
              min={usage}
              value={value}
              onChange={(event) => setValue(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
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
                onChange={(event) =>
                  setChecked(
                    event.target.checked
                      ? [...checked, step.id]
                      : checked.filter((id) => id !== step.id)
                  )
                }
              />
              {workNames[step.id] ?? step.id} ({formatEuro(step.costCents, moneyLocale)})
            </label>
          ))}
          <button
            type="button"
            className={button}
            disabled={busy || checked.length !== plan.steps.length}
            onClick={() =>
              void send(
                {
                  action: 'finish',
                  returnId: receipt.id,
                  completedWorkIds: checked,
                  completedOn: currentDate,
                },
                `finish:${receipt.id}`
              )
            }
          >
            {busy ? labels.busy : labels.finish}
          </button>
        </>
      )}
      {receipt?.status === 'PENDING_APPROVAL' && (
        <>
          <p role="status" className="text-sm">
            {labels.pendingApproval}
          </p>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() =>
              void send(
                {
                  action: 'review',
                  returnId: receipt.id,
                  decision: 'APPROVE',
                  reviewedOn: currentDate,
                },
                `review:${receipt.id}:approve`
              )
            }
          >
            {busy ? labels.busy : labels.approve}
          </button>
          <label className="block text-sm">
            {labels.rejectReason}
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 block w-full rounded border p-2 text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              maxLength={500}
              required
            />
          </label>
          <button
            type="button"
            className="rounded border border-stone-400 px-3 py-2 disabled:opacity-50"
            disabled={busy || reason.trim().length === 0}
            onClick={() =>
              void send(
                {
                  action: 'review',
                  returnId: receipt.id,
                  decision: 'REJECT',
                  reason: reason.trim(),
                  reviewedOn: currentDate,
                },
                `review:${receipt.id}:reject:${reason.trim()}`
              )
            }
          >
            {busy ? labels.busy : labels.reject}
          </button>
        </>
      )}
      {receipt?.status === 'REJECTED' && (
        <p role="status" className="text-sm">
          {labels.rejected} {receipt.reviewReason}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
