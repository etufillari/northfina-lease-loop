// The contract number a customer reads on the page and the invoices: `LL-YYYYMMDD-XXXXXXXX`,
// the signing day and the last 8 characters of the application id, upper case. An
// application has at most one contract (the unique `application_id`), so the number needs no
// counter and no read; the unique index on `number` catches the unlikely tail collision.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';

const TAIL_LENGTH = 8;

export function contractNumber(signedOn: string, applicationId: string): string {
  const day = isoDateSchema.parse(signedOn).replaceAll('-', '');
  const id = z.string().min(1).parse(applicationId);
  return `LL-${day}-${id.slice(-TAIL_LENGTH).toUpperCase()}`;
}
