// Every status the schema allows has a badge colour, so a wave 1 page never falls back to an
// accidental tone (docs/decisions.md D21). Fails when statuses.ts or the asset schema gains
// a status that badge.tsx does not know.
import { describe, expect, it } from 'vitest';
import { assetStatusSchema } from '@/data/schemas';
import { applicationDecisions, contractStatuses, invoiceStatuses } from '@/domain/statuses';
import { statusTone } from './badge';

const groups = {
  asset: assetStatusSchema.options,
  application: applicationDecisions,
  contract: contractStatuses,
  invoice: invoiceStatuses,
} as const;

describe('statusTone', () => {
  for (const [group, statuses] of Object.entries(groups)) {
    it.each(statuses)(`has a tone for the ${group} status %s`, (status) => {
      expect(Object.keys(statusTone)).toContain(status);
    });
  }
});
