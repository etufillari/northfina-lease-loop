import { z } from 'zod';
import { ApiError, readJsonBody } from './api-response';

export const applicationSelectionSchema = z.strictObject({
  id: z.string().min(1).max(80),
  termMonths: z.number().int().min(1).max(60),
  downPaymentCents: z.number().int().nonnegative(),
});
export const applicationInputSchema = z.strictObject({
  items: z.array(applicationSelectionSchema).min(1).max(10),
  answers: z
    .record(
      z
        .string()
        .regex(/^q_[a-z0-9_]+$/)
        .max(80),
      z.union([
        z.string().max(1000),
        z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        z.array(z.string().trim().min(1).max(200)).max(30),
      ])
    )
    .refine((answers) => Object.keys(answers).length <= 32),
});
export type ApplicationInput = z.infer<typeof applicationInputSchema>;

/** Bound the actual streamed bytes, not only the optional Content-Length header. */
export async function readApplicationInput(request: Request): Promise<ApplicationInput> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
    throw new ApiError(415, 'INVALID_CONTENT_TYPE', 'JSON is required.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 32_768) {
        await reader.cancel();
        throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return readJsonBody(new Request(request.url, { method: 'POST', body }), applicationInputSchema);
}
