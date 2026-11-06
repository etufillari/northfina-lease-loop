import { z } from 'zod';

const meta = z.object({ timestamp: z.iso.datetime({ offset: true }) });
const envelopeSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), data: z.unknown(), meta }),
  z.object({
    success: z.literal(false),
    error: z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]*$/) }),
    meta,
  }),
]);

export class RequestFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Validate the fixed envelope first, then the endpoint payload, without a type assertion. */
export async function readApiResponse<S extends z.ZodType>(
  response: Response,
  schema: S
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new RequestFailure('INVALID_RESPONSE');
  }
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new RequestFailure('INVALID_RESPONSE');
  const envelope = parsed.data;
  if (envelope.success !== response.ok) throw new RequestFailure('INVALID_RESPONSE');
  if (!envelope.success) throw new RequestFailure(envelope.error.code);
  // Unknown permits any value, but a success envelope must actually contain this property.
  if (!Object.hasOwn(envelope, 'data')) throw new RequestFailure('INVALID_RESPONSE');
  const payload = schema.safeParse(envelope.data);
  if (!payload.success) throw new RequestFailure('INVALID_RESPONSE');
  return payload.data;
}
