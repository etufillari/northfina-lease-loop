// Zod schemas of the demo card runner (contract first): `POST /api/demo/cards/[id]/run` runs one
// scenario card of CHALLENGE.md section 4 through the real services and answers the steps it took
// as codes with params, never sentences, and the page where the judges compare the numbers.
import { z } from 'zod';
import { assetConditionSchema, centsSchema, isoDateSchema, usageUnitSchema } from '@/data/schemas';
import { answerSchema } from '@/domain/rows/application';
import { exitModeSchema } from '@/domain/exits/mode';

/** The ten cards of CHALLENGE.md section 4. */
export const DEMO_CARD_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const demoCardIdSchema = z.number().int().min(1).max(10);
export type DemoCardId = z.infer<typeof demoCardIdSchema>;

/** Params of `POST /api/demo/cards/[id]/run`: the card number as the path writes it. */
export const demoCardParamsSchema = z.object({
  id: z
    .string()
    .regex(/^([1-9]|10)$/)
    .transform(Number),
});

/** The customer's way to the card: what they quote and apply for, on which day. */
export const demoTripSchema = z.strictObject({
  customerId: z.string().min(1),
  assetId: z.string().min(1),
  termMonths: z.number().int().positive(),
  downPaymentCents: centsSchema.default(0),
  /** The quote day; the application is made on it too. */
  quoteOn: isoDateSchema,
  /** Answers over the ones read from the customer's data-pack record; none for the ten cards. */
  answers: z.record(z.string(), answerSchema).default({}),
});

/**
 * One card's inputs, as data: `clock` is the day the demo clock is set to when the run ends
 * (the day the judges look at the landing page); `run` is how far down the customer's path it
 * goes. Nothing here is an output: the numbers are whatever the services return.
 */
export const demoCardSchema = z.discriminatedUnion('run', [
  z.strictObject({
    id: demoCardIdSchema,
    run: z.literal('sign'),
    clock: isoDateSchema,
    trip: demoTripSchema,
    signOn: isoDateSchema,
  }),
  z.strictObject({
    id: demoCardIdSchema,
    run: z.literal('apply'),
    clock: isoDateSchema,
    trip: demoTripSchema,
  }),
  z.strictObject({
    id: demoCardIdSchema,
    run: z.literal('exit_preview'),
    clock: isoDateSchema,
    trip: demoTripSchema,
    signOn: isoDateSchema,
    rentsPaid: z.number().int().positive(),
    exit: z.strictObject({
      mode: exitModeSchema,
      condition: assetConditionSchema,
      usage: z.strictObject({ unit: usageUnitSchema, value: z.number().int().nonnegative() }),
    }),
  }),
  z.strictObject({
    id: demoCardIdSchema,
    run: z.literal('asset'),
    clock: isoDateSchema,
    /** Who the judge acts as on the landing page. */
    actor: z.string().min(1),
    assetId: z.string().min(1),
    /** Where the judge lands: the assessment (card 9) or the passport (card 10). */
    page: z.enum(['second_life', 'passport']),
    /** A lease after the assessment (card 10): who quotes, applies and signs, on which days. */
    lease: z.strictObject({ trip: demoTripSchema, signOn: isoDateSchema }).optional(),
  }),
]);
export type DemoCard = z.infer<typeof demoCardSchema>;
export type DemoTrip = z.infer<typeof demoTripSchema>;
export type DemoCardInput = z.input<typeof demoCardSchema>;

/** One thing the run did, as a code the page writes from the message files. */
export const demoStepSchema = z.object({
  code: z.string().regex(/^[a-z_]+$/),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  /** The page that shows what the step wrote, without the locale prefix (`/contracts/…`). */
  href: z.string().startsWith('/').optional(),
});
export type DemoStep = z.infer<typeof demoStepSchema>;

/** The `data` of a run: the steps in order, the day and actor it set, the page to open. */
export const demoCardRunSchema = z.object({
  cardId: demoCardIdSchema,
  today: isoDateSchema,
  actor: z.string().min(1),
  steps: z.array(demoStepSchema),
  /** Without the locale prefix; the page adds the visitor's. */
  landing: z.string().startsWith('/'),
});
export type DemoCardRun = z.infer<typeof demoCardRunSchema>;
