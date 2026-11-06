import { z } from 'zod';
import type { DemoSelection } from './api';
import { priceTermsSchema } from '@/data/spine-value-schemas';

const cents = z.number().int().nonnegative().max(2147483647);
const answers = z.record(z.string(), z.union([z.string(), cents, z.array(z.string())]));
// Keep the draft's stripping policy; server snapshots use strictObject.
const terms = z.object(priceTermsSchema.shape);
const quote = z.object({
  id: z.uuid(),
  customerId: z.string(),
  assetId: z.string(),
  pricedOn: z.iso.date(),
  startDate: z.iso.date(),
  validThrough: z.iso.date(),
  priceSource: z.string(),
  terms,
});
const application = z.object({
  id: z.uuid(),
  quoteId: z.uuid(),
  decision: z.enum(['approved', 'declined', 'manual_review', 'incomplete']),
  reasons: z.array(z.string()),
  missingQuestionIds: z.array(z.string()),
  invalidQuestionIds: z.array(z.string()),
  answers,
});

export const emptySelection: DemoSelection = { customerId: '', businessDate: '', role: 'customer' };
export const selectionSchema = z.object({
  role: z.enum(['customer', 'operator']).optional(),
  customerId: z.string(),
  businessDate: z.union([z.literal(''), z.iso.date()]),
});
export const draftSchema = z.object({
  terms: z.object({
    termMonths: z.number().int().positive(),
    downText: z.string(),
    startDate: z.union([z.literal(''), z.iso.date()]),
  }),
  answers: answers.nullable(),
  quote: quote.nullable(),
  application: application.nullable(),
  contractId: z.uuid().nullable(),
  retries: z.record(z.string(), z.object({ fingerprint: z.string(), id: z.uuid() })),
});
export type Draft = z.infer<typeof draftSchema>;
export const emptyDraft: Draft = {
  terms: { termMonths: 36, downText: '0', startDate: '' },
  answers: null,
  quote: null,
  application: null,
  contractId: null,
  retries: {},
};
