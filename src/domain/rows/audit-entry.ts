// What `withAudit()` records (src/server/audit.ts), checked before the audit row is written.
import { z } from 'zod';
import { idSchema } from './fields';

/** The kinds of row an audit entry can be about. */
export const auditEntityTypes = [
  'asset',
  'customer',
  'quote',
  'application',
  'contract',
  'invoice',
  'asset_event',
  'return_assessment',
  'company_signatory',
] as const;

export const auditEntrySchema = z.strictObject({
  actor: z.string().min(1),
  /** `<entity>.<verb>`, e.g. `asset.status_changed`. */
  action: z.string().regex(/^[a-z_]+\.[a-z_]+$/, 'an action is <entity>.<verb>'),
  entityType: z.enum(auditEntityTypes),
  entityId: idSchema,
  details: z.unknown().optional(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
