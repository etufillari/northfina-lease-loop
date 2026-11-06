'use client';

// The Run button of one scenario card: posts to POST /api/demo/cards/[id]/run, which runs the
// card through the real services and sets the demo clock and the actor, then lists the steps it
// took (codes written from the message files) and links the page where the numbers are compared.
// A second click is refused by the server and links what the first run made (D70).
import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore } from 'react';
import { Button, LinkButton, Notice } from '@/components/ui';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { codedMessage, type CodedLine } from './card-steps';

type Step = CodedLine & { href?: string };

type Outcome =
  | { kind: 'ran'; steps: Step[]; landing: string }
  | { kind: 'refused'; line: CodedLine; landing: string | null }
  | { kind: 'error' };

type ApiBody =
  | { success: true; data: { steps: Step[]; landing: string } }
  | { success: false; error: { details?: CodedLine & { landing?: string | null } } };

async function runCard(cardId: number): Promise<Outcome> {
  const response = await fetch(`/api/demo/cards/${cardId}/run`, { method: 'POST' });
  const body = (await response.json()) as ApiBody;
  if (body.success) return { kind: 'ran', steps: body.data.steps, landing: body.data.landing };
  const details = body.error.details;
  if (!details?.code) return { kind: 'error' };
  const line = { code: details.code, params: details.params };
  return { kind: 'refused', line, landing: details.landing ?? null };
}

const noSubscription = () => () => {};

export function CardRunForm({ cardId, locale }: { cardId: number; locale: Locale }) {
  const router = useRouter();
  // False in the server HTML and until hydration: a click before then would be lost.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );
  const t = getT(locale);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Two clicks in one frame both fire before `pending` disables the button (review finding 13).
  const running = useRef(false);

  async function run() {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try {
      setOutcome(await runCard(cardId));
      // The clock and the actor moved: the header and the clock card follow.
      router.refresh();
    } catch {
      setOutcome({ kind: 'error' });
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  const landing = outcome && outcome.kind !== 'error' ? outcome.landing : null;
  return (
    <div className="space-y-3">
      <Button
        size="sm"
        pending={pending}
        pendingLabel={t('demo.run.pending')}
        disabled={!hydrated}
        onClick={run}
      >
        {t('demo.run.button', { id: cardId })}
      </Button>

      {outcome?.kind === 'ran' ? (
        <div aria-live="polite">
          <p className="mb-1 text-sm font-medium">{t('demo.run.steps')}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
            {outcome.steps.map((step, index) => (
              <li key={`${step.code}-${index}`} className="break-words">
                {codedMessage('demo.step', step, t, locale)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {outcome?.kind === 'refused' ? (
        <Notice tone="warning" live>
          {codedMessage('demo.run', outcome.line, t, locale)}
        </Notice>
      ) : null}
      {outcome?.kind === 'error' ? (
        <Notice tone="error" live>
          {t('demo.run.error')}
        </Notice>
      ) : null}
      {landing ? (
        <LinkButton href={`/${locale}${landing}`} variant="secondary" size="sm">
          {outcome?.kind === 'ran' ? t('demo.run.open') : t('demo.run.openEarlier')}
        </LinkButton>
      ) : null}
    </div>
  );
}
