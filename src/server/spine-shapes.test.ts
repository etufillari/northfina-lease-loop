import { describe, expect, it } from 'vitest';
import { priceTermsSchema as sharedTerms } from '@/data/spine-value-schemas';
import { handleRoute, ok, readJsonBody } from './api-response';
import {
  answersSchema,
  applicationInputSchema,
  emptyInputSchema,
  endInputSchema,
  priceTermsSchema,
  quoteInputSchema,
  relistInputSchema,
  requestIdSchema,
  signInputSchema,
} from './spine-shapes';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const quoteId = '550e8400-e29b-41d4-a716-446655440001';
const quote = {
  requestId,
  assetId: 'ebike-003',
  termMonths: 36,
  downPaymentCents: 0,
  startDate: '2026-11-05',
};
const application = {
  requestId,
  quoteId,
  answers: { q_email: 'person@example.com', q_monthly_income: 320000 },
};
const end = { requestId, choice: 'return', condition: 'good', usageValue: 18400 };
const relist = {
  requestId,
  releaseRevision: 0,
  netPriceCents: 100000,
  valuationReason: 'Condition reviewed',
  condition: 'good',
  completedTaskIds: ['safety_inspection'],
};

describe('strict command inputs', () => {
  it.each([
    ['quote', quoteInputSchema, quote],
    ['application', applicationInputSchema, application],
    ['sign', signInputSchema, { applicationId: quoteId }],
    ['empty', emptyInputSchema, {}],
    ['end', endInputSchema, end],
    ['relist', relistInputSchema, relist],
  ] as const)('accepts a valid %s command and rejects injected fields', (_name, schema, value) => {
    expect(schema.parse(value)).toEqual(value);
    expect(schema.safeParse({ ...value, monthlyNetCents: 1 }).success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
  });

  it('uses the shared price schema directly', () => {
    expect(priceTermsSchema).toBe(sharedTerms);
  });

  it.each(['not-a-uuid', '', '550e8400-e29b-41d4-a716', 42])(
    'rejects an invalid command ID: %s',
    (value) => {
      expect(requestIdSchema.safeParse(value).success).toBe(false);
    }
  );

  it.each([
    { assetId: '' },
    { assetId: 'a'.repeat(101) },
    { termMonths: 0 },
    { termMonths: 121 },
    { termMonths: 1.5 },
    { termMonths: '36' },
    { downPaymentCents: -1 },
    { downPaymentCents: 0.5 },
    { downPaymentCents: 2_147_483_648 },
    { downPaymentCents: '0' },
    { startDate: '2026-02-29' },
    { startDate: '2026-11-05T00:00:00Z' },
    { requestId: undefined },
  ])('rejects an invalid quote field: %o', (change) => {
    expect(quoteInputSchema.safeParse({ ...quote, ...change }).success).toBe(false);
  });

  it('accepts numeric boundaries while leaving supported-term decisions to pricing', () => {
    for (const termMonths of [1, 18, 120]) {
      expect(
        quoteInputSchema.safeParse({
          ...quote,
          termMonths,
          downPaymentCents: 2_147_483_647,
          assetId: 'a'.repeat(100),
        }).success
      ).toBe(true);
    }
  });

  it('does not accept a client-supplied approval when signing', () => {
    expect(
      signInputSchema.safeParse({ applicationId: quoteId, decision: 'approved' }).success
    ).toBe(false);
  });

  it.each([
    { choice: 'extend' },
    { condition: 'broken' },
    { usageValue: -1 },
    { usageValue: 0.5 },
    { usageValue: 2_147_483_648 },
    { nextCustomerId: '' },
    { nextCustomerId: 'a'.repeat(101) },
  ])('rejects an invalid closure field: %o', (change) => {
    expect(endInputSchema.safeParse({ ...end, ...change }).success).toBe(false);
  });

  it.each(['buy', 'return', 'pass_on'])('accepts the closure choice %s', (choice) => {
    expect(
      endInputSchema.safeParse({
        ...end,
        choice,
        usageValue: 2_147_483_647,
        nextCustomerId: 'cust-aino',
      }).success
    ).toBe(true);
  });

  it.each([
    { releaseRevision: -1 },
    { releaseRevision: 0.5 },
    { netPriceCents: 0 },
    { netPriceCents: 2_147_483_648 },
    { valuationReason: '   short   ' },
    { valuationReason: 'x'.repeat(501) },
    { completedTaskIds: Array(21).fill('inspection') },
    { completedTaskIds: [''] },
    { completedTaskIds: ['x'.repeat(101)] },
    { lastServiceUsage: -1 },
    { lastServiceUsage: 0.5 },
    { lastServiceUsage: 2_147_483_648 },
  ])('rejects an invalid preparation field: %o', (change) => {
    expect(relistInputSchema.safeParse({ ...relist, ...change }).success).toBe(false);
  });

  it('trims the valuation reason and accepts a zero service baseline', () => {
    expect(
      relistInputSchema.parse({
        ...relist,
        valuationReason: '  Condition reviewed  ',
        lastServiceUsage: 0,
      })
    ).toEqual({ ...relist, lastServiceUsage: 0 });
  });
});

describe('answer input shape', () => {
  it('accepts supported value forms without coercion or checking question applicability', () => {
    const values = { q_unknown: '250000', q_income: 0, q_owners: ['A', 'B'], q_empty: '' };
    expect(answersSchema.parse(values)).toEqual(values);
    expect(answersSchema.parse({})).toEqual({});
  });

  it.each(['email', 'q_', 'q_Email', 'q_email\n', 'q_email\r', 'constructor'])(
    'rejects an invalid question key: %s',
    (key) => {
      expect(answersSchema.safeParse({ [key]: 'value' }).success).toBe(false);
    }
  );

  it('strips the prototype key through Zod without changing the resulting prototype', () => {
    const input: unknown = JSON.parse('{"__proto__":{"admin":true},"q_name":"Name"}');
    const result = answersSchema.parse(input);
    expect(result).toEqual({ q_name: 'Name' });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, 'admin')).toBe(false);
  });

  it.each([
    true,
    null,
    {},
    -1,
    0.5,
    2_147_483_648,
    'x'.repeat(2001),
    ['x'.repeat(201)],
    Array(31).fill('A'),
    [1],
  ])('rejects unsupported answer values: %o', (value) => {
    expect(answersSchema.safeParse({ q_value: value }).success).toBe(false);
  });

  it('accepts the documented maximum string, list and amount sizes', () => {
    const values = {
      q_text: 'x'.repeat(2000),
      q_list: Array(30).fill('x'.repeat(200)),
      q_amount: 2_147_483_647,
    };
    expect(answersSchema.parse(values)).toEqual(values);
  });
});

it('returns the shared validation envelope for an invalid JSON command', async () => {
  const handler = handleRoute(async (request) => ok(await readJsonBody(request, quoteInputSchema)));
  for (const [body, code] of [
    ['{', 'INVALID_JSON'],
    [JSON.stringify({ ...quote, downPaymentCents: '0' }), 'VALIDATION_ERROR'],
  ]) {
    const response = await handler(
      new Request('https://lease.example.test/api/quotes', { method: 'POST', body }),
      undefined
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code } });
  }
});
