'use client';

// Shared by the three action components: run a POST, show "working…", show a translated
// error, and refresh the server-rendered page when it worked.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postReturnAction } from './post-return-action';

/** Translated texts the action components need; built on the server so no JSON is bundled. */
export type ActionTexts = {
  working: string;
  /** Error code (e.g. `RETURN_NOT_RECEIVED`, `NETWORK`) → message. */
  errors: Record<string, string>;
  genericError: string;
};

export function useReturnAction(texts: ActionTexts) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, body: unknown) {
    setPending(true);
    setError(null);
    const result = await postReturnAction(path, body);
    if (result.ok) {
      router.refresh();
    } else {
      setError(texts.errors[result.code] ?? texts.genericError);
    }
    setPending(false);
  }

  return { pending, error, run };
}
