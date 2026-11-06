'use client';

// Sign or decline through the link: POST /api/sign/:token, then re-render (D46).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { responseFailureText, type FailureLabels } from '@/components/api-failure';
import { Button, Notice } from '@/components/ui';

type SignFormProps = {
  token: string;
  labels: { sign: string; decline: string };
  /** The refusal sentences by code (product review 5); `error` for anything else. */
  failures: FailureLabels;
};

export function SignForm({ token, labels, failures }: SignFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState<'sign' | 'decline' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function act(action: 'sign' | 'decline') {
    setPending(action);
    setFailed(null);
    try {
      const response = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) setFailed(await responseFailureText(response, failures));
      else router.refresh();
    } catch {
      setFailed(failures.error);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {failed ? (
        <Notice tone="error" live>
          {failed}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => act('sign')}
          pending={pending === 'sign'}
          disabled={pending !== null}
        >
          {labels.sign}
        </Button>
        <Button
          variant="danger"
          onClick={() => act('decline')}
          pending={pending === 'decline'}
          disabled={pending !== null}
        >
          {labels.decline}
        </Button>
      </div>
    </div>
  );
}
