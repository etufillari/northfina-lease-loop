import { describe, expect, it } from 'vitest';
import { auditEntrySchema } from './audit-entry';

const entry = {
  actor: 'cust-aino',
  action: 'quote.created',
  entityType: 'quote',
  entityId: 'quote-1',
  details: { termMonths: 36 },
};

describe('auditEntrySchema: who changed what', () => {
  it('accepts `<entity>.<verb>` on a known entity', () => {
    expect(auditEntrySchema.parse(entry)).toEqual(entry);
    expect(auditEntrySchema.safeParse({ ...entry, action: 'asset.status_changed' }).success).toBe(
      true
    );
  });

  it('refuses an action that is not `<entity>.<verb>`', () => {
    expect(auditEntrySchema.safeParse({ ...entry, action: 'created a quote' }).success).toBe(false);
    expect(auditEntrySchema.safeParse({ ...entry, action: 'quote' }).success).toBe(false);
  });

  it('refuses an unknown entity type and an empty actor', () => {
    expect(auditEntrySchema.safeParse({ ...entry, entityType: 'payment' }).success).toBe(false);
    expect(auditEntrySchema.safeParse({ ...entry, actor: '' }).success).toBe(false);
  });

  it('takes an entry without details', () => {
    const { details: _details, ...bare } = entry;
    expect(auditEntrySchema.safeParse(bare).success).toBe(true);
  });
});
