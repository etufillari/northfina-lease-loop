// The domain events of docs/kickoff-brief.md section 7. When one change touches several
// slices' rows at one instant (signing, the end of a term, a payment), the owning slice emits
// one of these inside its `withAudit` transaction and the other slices' handlers react in the
// same transaction (src/server/events.ts). This file is only the contract: payload shapes.
//
// House rules: ids are non-empty strings, money is integer cents, dates are ISO `YYYY-MM-DD`
// days, the VAT rate is integer basis points (25.5 % = 2550) so no float crosses a slice.
// Every payload is strict: an unknown field is an error, so a typo fails at the emit.
import { z } from 'zod';
import { assetConditionSchema, centsSchema, isoDateSchema, usageUnitSchema } from '@/data/schemas';
import { vatRateBpSchema } from './rows/fields';

/** A row id of another slice's table. */
const idSchema = z.string().min(1);

/** A real calendar day, `YYYY-MM-DD` (Zod's ISO date regex: month 01–12, day within the month). */
export const eventDateSchema = isoDateSchema;

/** A VAT rate in basis points: 2550 means 25.5 %, at most 10 000 (100 %). */
export const vatRateBasisPointsSchema = vatRateBpSchema;

/** Why a unit came back: the term ended, or the customer left early. */
export const returnReasonSchema = z.enum(['end_of_term', 'early_exit']);

export const contractSignedSchema = z
  .strictObject({
    type: z.literal('CONTRACT_SIGNED'),
    contractId: idSchema,
    customerId: idSchema,
    assetId: idSchema,
    quantity: z.number().int().positive(),
    /** The signing day: the down payment's invoice day (D5). It may precede the start (D7). */
    signedOn: eventDateSchema,
    startDate: eventDateSchema,
    /** Inclusive: the last day of the term. */
    endDate: eventDateSchema,
    termMonths: z.number().int().positive(),
    downPaymentCents: centsSchema,
    /** The monthly rent without VAT. */
    netRentCents: centsSchema,
    buyoutCents: centsSchema,
    /** The rate in force on the signing day, kept for the explanation (decision D2). */
    vatRateBasisPoints: vatRateBasisPointsSchema,
  })
  // ISO days compare correctly as strings.
  .refine((event) => event.endDate >= event.startDate, {
    message: 'endDate is before startDate',
    path: ['endDate'],
  });

export const contractBoughtOutSchema = z.strictObject({
  type: z.literal('CONTRACT_BOUGHT_OUT'),
  contractId: idSchema,
  assetId: idSchema,
  date: eventDateSchema,
  /** The buyout price without VAT. */
  amountCents: centsSchema,
});

const unitBackFields = {
  contractId: idSchema,
  assetId: idSchema,
  date: eventDateSchema,
  reason: returnReasonSchema,
  /** The condition and usage the customer reported; second life assesses them. */
  condition: assetConditionSchema,
  usage: z.strictObject({ unit: usageUnitSchema, value: z.number().int().nonnegative() }),
};

export const unitReturnedSchema = z.strictObject({
  type: z.literal('UNIT_RETURNED'),
  ...unitBackFields,
});

export const unitPassedOnSchema = z.strictObject({
  type: z.literal('UNIT_PASSED_ON'),
  ...unitBackFields,
  /** The customer the next application is pre-filled for. */
  nextCustomerId: idSchema,
});

export const invoicePaidSchema = z.strictObject({
  type: z.literal('INVOICE_PAID'),
  invoiceId: idSchema,
  contractId: idSchema,
  amountCents: centsSchema,
  date: eventDateSchema,
});

/** Every event, told apart by `type`. */
export const domainEventSchema = z.discriminatedUnion('type', [
  contractSignedSchema,
  contractBoughtOutSchema,
  unitReturnedSchema,
  unitPassedOnSchema,
  invoicePaidSchema,
]);

export type ContractSigned = z.infer<typeof contractSignedSchema>;
export type DomainEvent = z.infer<typeof domainEventSchema>;
export type EventType = DomainEvent['type'];
/** The event of one type, e.g. `EventOf<'INVOICE_PAID'>`. */
export type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;

/** The schema of each event, by type. */
export const eventPayloadSchemas = {
  CONTRACT_SIGNED: contractSignedSchema,
  CONTRACT_BOUGHT_OUT: contractBoughtOutSchema,
  UNIT_RETURNED: unitReturnedSchema,
  UNIT_PASSED_ON: unitPassedOnSchema,
  INVOICE_PAID: invoicePaidSchema,
} as const satisfies { [T in EventType]: z.ZodType<EventOf<T>> };

export const EVENT_TYPES = Object.keys(eventPayloadSchemas) as EventType[];
