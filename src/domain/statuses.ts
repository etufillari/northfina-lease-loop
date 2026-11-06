// Allowed values of the status-like columns in prisma/schema.prisma. SQLite has no enums,
// so every write checks its value against one of these schemas first.
// The lists come from docs/kickoff-brief.md section 6 and D10.
import { z } from 'zod';

/** What the question flow decided about an application, or that the applicant withdrew it. */
export const applicationDecisions = [
  'approved',
  'rejected',
  'manual_review',
  'awaiting_signatory',
  /** The applicant stepped back before signing (D87). Final. */
  'withdrawn',
] as const;
export const applicationDecisionSchema = z.enum(applicationDecisions);
export type ApplicationDecision = z.infer<typeof applicationDecisionSchema>;

/** Where a contract is in its life. Every status but `active` is an end. */
export const contractStatuses = [
  'active',
  'bought',
  'returned',
  'passed_on',
  'ended_early',
] as const;
export const contractStatusSchema = z.enum(contractStatuses);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const invoiceKinds = ['down_payment', 'rent', 'buyout', 'early_exit'] as const;
export const invoiceKindSchema = z.enum(invoiceKinds);
export type InvoiceKind = z.infer<typeof invoiceKindSchema>;

/** `cancelled`: an unpaid rent an early exit replaced with its D14 invoice (docs/features/exits.md). */
export const invoiceStatuses = ['issued', 'paid', 'cancelled'] as const;
export const invoiceStatusSchema = z.enum(invoiceStatuses);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/** One entry in an asset's passport. */
export const assetEventKinds = [
  'leased',
  'returned',
  'assessed',
  'refurbished',
  'repriced',
  'bought',
  'passed_on',
] as const;
export const assetEventKindSchema = z.enum(assetEventKinds);
export type AssetEventKind = z.infer<typeof assetEventKindSchema>;
