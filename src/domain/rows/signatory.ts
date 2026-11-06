// The write schemas of the `CompanySignatory` and `SignatureRequest` rows (prisma/schema.prisma,
// D46), parsed on the server before every write (D23).
import { z } from 'zod';
import { idSchema, isoDateSchema, ON_VALID_FIELDS } from './fields';

/** The `granted_by` of an entry no signatory granted: the register check, simulated (D46). */
export const REGISTER_CHECK_SIMULATED = 'register_check_simulated';

/** An e-mail as stored: trimmed, lower case, something@something.tld. */
export const signatoryEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'not an e-mail address');

export const signatoryNameSchema = z.string().trim().min(1).max(200);

export const companySignatoryRowSchema = z
  .strictObject({
    id: idSchema.optional(),
    customer_id: idSchema,
    name: signatoryNameSchema,
    email: signatoryEmailSchema,
    granted_by: idSchema,
    granted_on: isoDateSchema,
    valid_from: isoDateSchema.nullable(),
    valid_to: isoDateSchema.nullable(),
  })
  .refine(
    (row) => row.valid_to === null || (row.valid_from !== null && row.valid_from <= row.valid_to),
    {
      message: 'valid_to needs a valid_from on or before it',
      path: ['valid_to'],
      ...ON_VALID_FIELDS,
    }
  );

/** The columns a revocation or the opening of the link changes. */
export const companySignatoryValidityUpdateSchema = z.strictObject({
  valid_from: isoDateSchema.nullable(),
  valid_to: isoDateSchema.nullable(),
});

export const signatureRequestRowSchema = z
  .strictObject({
    id: idSchema.optional(),
    application_id: idSchema,
    signatory_id: idSchema,
    token: z.string().regex(/^[A-Za-z0-9_-]{32,}$/, 'a token is 32+ url-safe characters'),
    sent_on: isoDateSchema,
    expires_on: isoDateSchema,
  })
  .refine((row) => row.sent_on < row.expires_on, {
    message: 'a link expires after the day it is sent',
    path: ['expires_on'],
    ...ON_VALID_FIELDS,
  });

/** The columns the signatory's answer sets: opened and either signed or declined, once. */
export const signatureRequestAnswerSchema = z
  .strictObject({
    opened_on: isoDateSchema,
    signed_on: isoDateSchema.nullable(),
    declined_on: isoDateSchema.nullable(),
  })
  .refine((row) => (row.signed_on === null) !== (row.declined_on === null), {
    message: 'a link is either signed or declined',
    ...ON_VALID_FIELDS,
  });
