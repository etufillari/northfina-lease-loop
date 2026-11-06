// The words for a refused form post (product review finding 5): the API answers with an error
// envelope `{ error: { code, details? } }` (src/server/api-response.ts), and the form shows the
// sentence for that code in the visitor's language instead of one generic error. An
// authorization refusal (`FORBIDDEN`, D74) carries its own code in `details.code`, which wins.

/** Error code → sentence, from the message files; `error` for anything else. */
export type FailureLabels = Record<string, string> & { error: string };

type Envelope = { error?: { code?: unknown; details?: { code?: unknown } | null } };

/** The sentence for a failed response's body; the generic `error` when no code is known. */
export function failureText(body: unknown, labels: FailureLabels): string {
  const error = (body as Envelope | null)?.error;
  const detail = typeof error?.details?.code === 'string' ? error.details.code : undefined;
  const code = typeof error?.code === 'string' ? error.code : undefined;
  if (detail && Object.hasOwn(labels, detail)) return labels[detail] as string;
  if (code && Object.hasOwn(labels, code)) return labels[code] as string;
  return labels.error;
}

/** Reads a failed response's body (never throws: a body that is not JSON is no code). */
export async function responseFailureText(
  response: Response,
  labels: FailureLabels
): Promise<string> {
  return failureText(await response.json().catch(() => null), labels);
}
