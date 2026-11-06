'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
export function ReturnNotifications({
  locale,
  labels,
}: {
  locale: string;
  labels: { title: string; pending: string; empty: string; error: string; signIn: string };
}) {
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'auth' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch('/api/operator/notifications', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 403 || response.status === 404) {
          setState('auth');
          return;
        }
        if (!response.ok) throw new Error('failed');
        const body: { data?: { count?: unknown } } = await response.json();
        if (!Number.isSafeInteger(body.data?.count) || Number(body.data?.count) < 0)
          throw new Error('invalid_response');
        setCount(Number(body.data?.count));
        setState('ready');
      } catch {
        if (!controller.signal.aborted) setState('error');
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    window.addEventListener('lease-loop-returns-changed', focus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      window.removeEventListener('lease-loop-returns-changed', focus);
    };
  }, []);
  return (
    <aside
      aria-label={labels.title}
      className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950 sm:px-8 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
    >
      <p role="status" aria-live="polite" aria-atomic="true">
        {state === 'error'
          ? labels.error
          : state === 'auth'
            ? labels.signIn
            : count === null
              ? labels.title
              : count > 0
                ? `${count} ${labels.pending}`
                : labels.empty}
      </p>
      <Link
        className="inline-block min-h-11 py-2 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
        href={`/${locale}/circular?view=${state === 'auth' ? 'returned' : 'requests'}`}
        onClick={() => router.refresh()}
      >
        {labels.title}
      </Link>
    </aside>
  );
}
