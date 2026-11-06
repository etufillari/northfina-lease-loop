// Calls one of the return routes and reads the API envelope. The client components use this
// for every dealer action, so the success and error handling is written once.
export type ActionResult = { ok: true } | { ok: false; code: string };

/** The envelope is `{ success: true, data }` or `{ success: false, error: { code } }`. */
export function readEnvelope(body: unknown): ActionResult {
  if (typeof body === 'object' && body !== null && 'success' in body) {
    if (body.success === true) return { ok: true };
    if ('error' in body && typeof body.error === 'object' && body.error !== null) {
      const { code } = body.error as { code?: unknown };
      if (typeof code === 'string') return { ok: false, code };
    }
  }
  return { ok: false, code: 'UNKNOWN' };
}

/** POSTs JSON. A network failure or a non-JSON reply becomes `NETWORK` / `UNKNOWN`. */
export async function postReturnAction(path: string, body: unknown): Promise<ActionResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
  try {
    return readEnvelope(await response.json());
  } catch {
    return { ok: false, code: 'UNKNOWN' };
  }
}
