'use client';

// The admin's "Assess and relist": POST /api/assets/:id/assessments, then the page reloads with
// the stored assessment. The server assesses on its own day (the demo clock) as the actor of
// its cookie; the browser sends nothing. A refusal comes back as a code, written from the
// message files.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { authzRefusalKey } from '@/components/authz-refusal';

const REFUSALS = [
  'demand_taken',
  'asset_not_returned',
  'asset_not_found',
  'no_list_price',
  'relist_unpriced',
];

export function AssessButton({ assetId, locale }: { assetId: string; locale: Locale }) {
  const t = getT(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assess() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/assessments`, {
      method: 'POST',
    }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    if (!body?.success) {
      const code: unknown = body?.error?.details?.code;
      const authz = authzRefusalKey(code);
      const known = typeof code === 'string' && REFUSALS.includes(code) ? code : 'unknown';
      setError(t(authz ?? (`secondLife.refusal.${known}` as MessageKey)));
      setPending(false);
      return;
    }
    router.refresh();
    setPending(false);
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Notice tone="error" live>
          {error}
        </Notice>
      ) : null}
      <Button
        type="button"
        onClick={assess}
        pending={pending}
        pendingLabel={t('secondLife.pending')}
      >
        {t('secondLife.button')}
      </Button>
    </div>
  );
}
