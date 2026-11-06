// The event payloads of docs/kickoff-brief.md section 7: each one parses a valid example and
// rejects a float amount, a bad date and a missing id, so a slice that emits a wrong shape
// fails at the emit, not three slices later.
import { describe, expect, it } from 'vitest';
import { domainEventSchema, EVENT_TYPES, eventPayloadSchemas, type DomainEvent } from './events';

const signed = {
  type: 'CONTRACT_SIGNED',
  contractId: 'contract-001',
  customerId: 'cust-001',
  assetId: 'ebike-001',
  quantity: 1,
  signedOn: '2026-11-05',
  startDate: '2026-11-06',
  endDate: '2029-11-05',
  termMonths: 36,
  downPaymentCents: 50000,
  netRentCents: 10730,
  buyoutCents: 27900,
  vatRateBasisPoints: 2550,
} as const;

const boughtOut = {
  type: 'CONTRACT_BOUGHT_OUT',
  contractId: 'contract-001',
  assetId: 'ebike-001',
  date: '2029-11-05',
  amountCents: 27900,
} as const;

const returned = {
  type: 'UNIT_RETURNED',
  contractId: 'contract-001',
  assetId: 'ebike-001',
  date: '2028-02-29',
  reason: 'early_exit',
  condition: 'good',
  usage: { unit: 'km', value: 4200 },
} as const;

const passedOn = {
  ...returned,
  type: 'UNIT_PASSED_ON',
  reason: 'end_of_term',
  nextCustomerId: 'cust-002',
} as const;

const paid = {
  type: 'INVOICE_PAID',
  invoiceId: 'invoice-001',
  contractId: 'contract-001',
  amountCents: 13466,
  date: '2026-12-01',
} as const;

/** One valid example per event, with the field names of its id, amount and date. */
const examples: { event: DomainEvent; id: string; amount: string; date: string }[] = [
  { event: signed, id: 'contractId', amount: 'netRentCents', date: 'startDate' },
  { event: boughtOut, id: 'assetId', amount: 'amountCents', date: 'date' },
  { event: returned, id: 'contractId', amount: 'quantity', date: 'date' },
  { event: passedOn, id: 'nextCustomerId', amount: 'quantity', date: 'date' },
  { event: paid, id: 'invoiceId', amount: 'amountCents', date: 'date' },
];

describe('event payloads (kickoff brief section 7)', () => {
  it('has one example per event type', () => {
    expect(examples.map(({ event }) => event.type).sort()).toEqual([...EVENT_TYPES].sort());
  });

  for (const { event, id, amount, date } of examples) {
    describe(event.type, () => {
      const schema = eventPayloadSchemas[event.type];

      it('parses a valid example, through its own schema and the union', () => {
        expect(schema.parse(event)).toEqual(event);
        expect(domainEventSchema.parse(event)).toEqual(event);
      });

      it('rejects a float amount', () => {
        // UNIT_RETURNED and UNIT_PASSED_ON carry no money; their integer is the usage value.
        const bad =
          amount === 'quantity'
            ? { ...event, usage: { unit: 'km', value: 4200.5 } }
            : { ...event, [amount]: 107.3 };
        expect(schema.safeParse(bad).success).toBe(false);
      });

      it('rejects a bad date', () => {
        for (const value of ['2026-13-01', '2026-02-30', '6.11.2026', '2026-11-06T00:00:00Z']) {
          expect(schema.safeParse({ ...event, [date]: value }).success).toBe(false);
        }
      });

      it('rejects a missing or empty id', () => {
        const { [id]: _removed, ...missing } = event as Record<string, unknown>;
        expect(schema.safeParse(missing).success).toBe(false);
        expect(schema.safeParse({ ...event, [id]: '' }).success).toBe(false);
      });

      it('rejects an unknown field', () => {
        expect(schema.safeParse({ ...event, extra: 1 }).success).toBe(false);
      });
    });
  }

  it('CONTRACT_SIGNED rejects a zero or fractional quantity and a negative down payment', () => {
    const schema = eventPayloadSchemas.CONTRACT_SIGNED;
    expect(schema.safeParse({ ...signed, quantity: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...signed, quantity: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ ...signed, downPaymentCents: -1 }).success).toBe(false);
  });

  it('CONTRACT_SIGNED requires the signing day as a real ISO day', () => {
    const schema = eventPayloadSchemas.CONTRACT_SIGNED;
    const { signedOn: _signedOn, ...withoutSignedOn } = signed;
    expect(schema.safeParse(withoutSignedOn).success).toBe(false);
    expect(schema.safeParse({ ...signed, signedOn: '2026-02-30' }).success).toBe(false);
  });

  it('CONTRACT_SIGNED rejects an end date before the start date', () => {
    const bad = { ...signed, endDate: '2026-11-05' };
    expect(eventPayloadSchemas.CONTRACT_SIGNED.safeParse(bad).success).toBe(false);
  });

  it('the union rejects an unknown type', () => {
    expect(domainEventSchema.safeParse({ ...paid, type: 'INVOICE_VOIDED' }).success).toBe(false);
  });
});
