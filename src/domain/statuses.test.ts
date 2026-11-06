// The allowed values of every status-like column (docs/kickoff-brief.md section 6, D10).
import { describe, expect, it } from 'vitest';
import {
  applicationDecisionSchema,
  applicationDecisions,
  assetEventKindSchema,
  assetEventKinds,
  contractStatusSchema,
  contractStatuses,
  invoiceKindSchema,
  invoiceKinds,
  invoiceStatusSchema,
  invoiceStatuses,
} from './statuses';

describe('allowed values', () => {
  it('application decisions are the four of D10 and the withdrawal of D87', () => {
    expect(applicationDecisions).toEqual([
      'approved',
      'rejected',
      'manual_review',
      'awaiting_signatory',
      'withdrawn',
    ]);
  });

  it('contract statuses cover every way a lease ends', () => {
    expect(contractStatuses).toEqual(['active', 'bought', 'returned', 'passed_on', 'ended_early']);
  });

  it('invoice kinds and statuses', () => {
    expect(invoiceKinds).toEqual(['down_payment', 'rent', 'buyout', 'early_exit']);
    expect(invoiceStatuses).toEqual(['issued', 'paid', 'cancelled']);
  });

  it('asset event kinds are the passport entries', () => {
    expect(assetEventKinds).toEqual([
      'leased',
      'returned',
      'assessed',
      'refurbished',
      'repriced',
      'bought',
      'passed_on',
    ]);
  });
});

describe('schemas', () => {
  it.each([
    [applicationDecisionSchema, 'manual_review'],
    [contractStatusSchema, 'ended_early'],
    [invoiceKindSchema, 'down_payment'],
    [invoiceStatusSchema, 'paid'],
    [assetEventKindSchema, 'passed_on'],
  ])('accepts a listed value', (schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each([
    [applicationDecisionSchema, 'pending'],
    [contractStatusSchema, 'Active'],
    [invoiceKindSchema, ''],
    [invoiceStatusSchema, 'overdue'],
    [assetEventKindSchema, null],
  ])('rejects an unlisted value, wrong case, empty or null', (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
