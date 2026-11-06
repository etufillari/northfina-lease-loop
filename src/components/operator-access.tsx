'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function OperatorAccess({
  signedIn,
  labels,
}: {
  signedIn: boolean;
  labels: { password: string; login: string; logout: string; error: string };
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/operator/session', {
        method: signedIn ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: signedIn ? undefined : JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error('failed');
      setPassword('');
      window.dispatchEvent(new Event('lease-loop-returns-changed'));
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {!signedIn && (
        <label className="block space-y-2 text-sm font-medium">
          {labels.password}
          <input
            className="ui-control mt-2"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      <button className={signedIn ? 'ui-secondary' : 'ui-primary w-full'} disabled={busy}>
        {signedIn ? labels.logout : labels.login}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {labels.error}
        </p>
      )}
    </form>
  );
}
