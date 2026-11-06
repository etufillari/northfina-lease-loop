'use client';

// The admin approves or rejects a manual review: POST /api/applications/:id/decision, then
// re-render. A case waiting for the signatory is signed through the signing link (D46).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { responseFailureText, type FailureLabels } from '@/components/api-failure';
import { Button, Notice } from '@/components/ui';

type DecisionFormProps = {
  applicationId: string;
  labels: { approve: string; reject: string };
  /** The refusal sentences by code (product review 5); `error` for anything else. */
  failures: FailureLabels;
};

export function DecisionForm({ applicationId, labels, failures }: DecisionFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'rejected') {
    setPending(decision);
    setFailed(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The reviewer is the server's actor, never sent (review finding 13).
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) setFailed(await responseFailureText(response, failures));
      else router.refresh();
    } catch {
      setFailed(failures.error);
    } finally {
      setPending(null);
    }
  }

  const blocked = pending !== null;
  return (
    <div className="space-y-4">
      {failed ? (
        <Notice tone="error" live>
          {failed}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => decide('approved')}
          pending={pending === 'approved'}
          disabled={blocked}
        >
          {labels.approve}
        </Button>
        <Button
          variant="danger"
          onClick={() => decide('rejected')}
          pending={pending === 'rejected'}
          disabled={blocked}
        >
          {labels.reject}
        </Button>
      </div>
    </div>
  );
}
