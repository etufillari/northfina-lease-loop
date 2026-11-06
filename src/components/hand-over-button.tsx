'use client';

// "Hand it over now" after a pass-on (#65): on the handover day the server re-lists the item for
// the next person and stores their quote, then we open it. Before that day the button waits.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { refusalText } from '@/i18n/refusals';

export function HandOverButton(props: {
  locale: Locale;
  contractId: number;
  assetId: string;
  /** Who the item was passed on to, as the summary names them. */
  name: string;
  /** The handover day: the button opens then. */
  handoverDate: string;
  today: string;
}) {
  const { locale } = props;
  const t = getT(locale);
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  // The code the server refused with picks the message (D-038).
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const tooEarly = props.today < props.handoverDate;

  async function handOver() {
    setState('busy');
    const response = await fetch(`/api/contracts/${props.contractId}/hand-over`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      success: boolean;
      data?: { quoteId: number };
      error?: { code: string };
    } | null;
    if (body?.success && body.data) {
      router.push(`/${locale}/quotes/${body.data.quoteId}`);
      return;
    }
    setRefusal(body?.error?.code);
    setState('error');
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      <p className="text-sm">{t('handOver.intro', { name: props.name })}</p>
      <button
        type="button"
        onClick={() => void handOver()}
        disabled={tooEarly || state === 'busy'}
        className="btn-primary mt-3 px-6 py-3"
      >
        {t(state === 'busy' ? 'handOver.busy' : 'handOver.button')}
      </button>
      {tooEarly ? (
        <p className="mt-2 text-sm text-muted">
          {t('handOver.notYet', { date: formatIsoDate(props.handoverDate, locale) })}
        </p>
      ) : null}
      {state === 'error' ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {/* "Too early to choose" is the end-of-term wording; here it is the handover day. */}
          {refusal === 'TOO_EARLY'
            ? t('handOver.notYet', { date: formatIsoDate(props.handoverDate, locale) })
            : refusalText(t, refusal, 'handOver.error')}{' '}
          <Link
            href={`/${locale}/assets/${props.assetId}`}
            className="underline underline-offset-4 hover:text-accent-text"
          >
            {t('handOver.manual')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
