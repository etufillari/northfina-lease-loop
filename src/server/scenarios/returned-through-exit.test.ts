// An item returned through the app's own exit, assessed and relisted (bug report 2026-11-06:
// "the second-life page is broken and Assess and relist errors"). The cards' second-life tests
// start from the data pack's `returned` items (ebike-007, ebike-008); here the item is leased
// through the real services (quote → application → sign), ended through the exit service, then
// read the way the second-life page reads it and assessed through the route as the admin, as
// the "Assess and relist" button does. Every exit mode, each category, and a second return that
// leads to a third life. The report did not reproduce on a migrated database: these pin the path.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { payRents, signedContract } from '../../../tests/helpers/journey';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import type { PrismaClient } from '../prisma-client';

const holder = vi.hoisted(() => ({
  db: undefined as unknown as PrismaClient,
  actor: 'admin',
  today: '2026-11-05',
}));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));
// The request's cookies: the "continue as" actor and the demo clock (D17, D74).
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'lease-loop-actor'
        ? { value: holder.actor }
        : name === 'lease-loop-as-of'
          ? { value: holder.today }
          : undefined,
  }),
}));

const { POST } = await import('@/app/api/assets/[id]/assessments/route');
const { exitContract } = await import('../exits');
const { latestAssessment, previewAssessment } = await import('../second-life');
const { getAsset } = await import('../assets');
const { listAssetsWithLives } = await import('../asset-lives');
const { listAssetEvents, readFleetImpact, readPassport } = await import('../asset-events');
const { assessmentResponseSchema } = await import('../second-life-schemas');
const { verifyAuditChain } = await import('../audit');
const { createQuote } = await import('../quotes');

beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
let cleanup: () => Promise<void>;
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  holder.actor = 'admin';
  await resetDb(holder.db);
  await seedPack(holder.db);
});
withProductionHandlers();

type Reported = { condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor'; value: number };

async function lease(assetId: string, customerId: string, termMonths: number, on: string) {
  const trip = { customerId, assetId, termMonths, quoteOn: on };
  return (await signedContract(holder.db, trip)).contract;
}

async function giveBack(
  contract: { id: string; assetId: string },
  customerId: string,
  today: string,
  reported: Reported,
  mode: 'return' | 'pass_on' | 'buy' = 'return',
  nextCustomerId?: string
) {
  const asset = await getAsset(holder.db, contract.assetId);
  const result = await exitContract(
    holder.db,
    {
      contractId: contract.id,
      mode,
      nextCustomerId,
      reported: {
        condition: reported.condition,
        usage: { unit: asset!.usage.unit, value: reported.value },
      },
      actor: customerId,
    },
    today
  );
  if (!result.ok) throw new Error(`exit refused: ${result.reason.code}`);
}

/** POST /api/assets/:id/assessments as the button sends it: no body, the admin's cookie. */
async function assessViaRoute(assetId: string, today: string) {
  holder.today = today;
  const request = new Request(`http://localhost/api/assets/${assetId}/assessments`, {
    method: 'POST',
  });
  const response = await POST(request, { params: Promise.resolve({ id: assetId }) });
  return { status: response.status, body: await response.json() };
}

/** What the page shows before the click (the preview), the click, then the stored assessment. */
async function pageThenAssess(assetId: string, today: string) {
  const preview = await previewAssessment(holder.db, assetId, today);
  if (!preview.ok) throw new Error(`preview refused: ${preview.reason.code}`);
  expect(preview.proposal.assessment.options.length).toBeGreaterThan(0);
  const { status, body } = await assessViaRoute(assetId, today);
  expect(status, JSON.stringify(body.error)).toBe(201);
  const data = assessmentResponseSchema.parse(body.data);
  const stored = await latestAssessment(holder.db, assetId);
  expect(stored?.id).toBe(data.id);
  expect(stored?.match.relist.secondLifeFinancedCents).toBe(data.secondLifeFinancedCents);
  const asset = await getAsset(holder.db, assetId);
  expect(asset?.status).toBe('available');
  return { preview: preview.proposal, data, stored: stored! };
}

const kindsSince = async (assetId: string, kinds: readonly string[]) =>
  (await listAssetEvents(holder.db, assetId)).map((e) => e.kind).filter((k) => kinds.includes(k));

describe('card 1: ebike-003 leased and given back through the exit', () => {
  it('returned at the end of term: the page previews, the admin relists it, Life 2 in the catalogue', async () => {
    const contract = await lease('ebike-003', 'cust-aino', 36, '2026-11-05');
    await payRents(holder.db, contract.id, 36, 'cust-aino');
    await giveBack(contract, 'cust-aino', contract.endDate, { condition: 'good', value: 3_000 });

    const { data, stored } = await pageThenAssess('ebike-003', contract.endDate);
    expect(data.contractId).toBe(contract.id);
    expect(data.returnedCondition).toBe('good');
    // D60, D31: valued from its own first lease. The end day is the term's last day, inclusive,
    // one day short of 36 whole months since 2026-11-05.
    expect(stored.assessment.ageMonths).toBe(35);
    expect(stored.input.newPriceCents).toBe(contract.unitListPriceCents);
    // One audited change: the assessment and its passport events, then relisted.
    expect(await kindsSince('ebike-003', ['assessed', 'refurbished', 'repriced'])).toEqual(
      data.refurbishmentCents > 0
        ? ['assessed', 'refurbished', 'repriced']
        : ['assessed', 'repriced']
    );
    expect((await verifyAuditChain(holder.db)).ok).toBe(true);

    const listed = (await listAssetsWithLives(holder.db)).find((a) => a.id === 'ebike-003');
    expect(listed).toMatchObject({ status: 'available', previous_lives: 1 });
    // Leasable again, at the second-life price.
    const quote = await createQuote(holder.db, {
      assetId: 'ebike-003',
      termMonths: 24,
      downPaymentCents: 0,
      today: contract.endDate,
      actor: 'cust-lena',
    });
    expect(quote.ok).toBe(true);
    // The file's first test warms the database and the modules: 0.7 s alone, over the 5 s
    // default under the coverage run's load (seen in `npm run check:all`).
  }, 20_000);

  it('given back on the day it was signed (age 0): the preview and the relist still work', async () => {
    const contract = await lease('ebike-003', 'cust-aino', 36, '2026-11-05');
    await giveBack(contract, 'cust-aino', '2026-11-05', { condition: 'new', value: 0 });
    const { stored } = await pageThenAssess('ebike-003', '2026-11-05');
    expect(stored.assessment.ageMonths).toBe(0);
    // No waiting-list entry fits a new bike's rent: relisted without a match.
    expect(stored.match.decision.code).toBe('relist_without_match');
    expect(stored.match.winner).toBeNull();
  });

  it('given back early and worn (fair, 2 500 km, D77 reported): assessed as reported', async () => {
    const contract = await lease('ebike-003', 'cust-aino', 24, '2026-11-05');
    await giveBack(contract, 'cust-aino', '2027-06-05', { condition: 'fair', value: 2_500 });
    const { data, stored } = await pageThenAssess('ebike-003', '2027-06-05');
    expect(data.returnedCondition).toBe('fair');
    expect(stored.input.usage).toEqual({ unit: 'km', value: 2_500 });
    expect(stored.assessment.ageMonths).toBe(7);
  });
});

describe('each category through the exit', () => {
  it('a laptop (laptop-001) returned at the end of term', async () => {
    const contract = await lease('laptop-001', 'cust-aino', 24, '2026-11-05');
    await giveBack(contract, 'cust-aino', contract.endDate, { condition: 'good', value: 400 });
    const { stored } = await pageThenAssess('laptop-001', contract.endDate);
    expect(stored.input.usage.unit).toBe('battery_cycles');
  });

  it('a farm machine (farm-001) returned at the end of term', async () => {
    const contract = await lease('farm-001', 'cust-pekka', 12, '2026-11-05');
    await giveBack(contract, 'cust-pekka', contract.endDate, { condition: 'good', value: 900 });
    const { stored } = await pageThenAssess('farm-001', contract.endDate);
    expect(stored.input.usage.unit).toBe('engine_hours');
  });
});

describe('the other exit modes', () => {
  it('passed on (D90): the item goes straight to the next person, held for them, nothing to assess', async () => {
    const contract = await lease('ebike-003', 'cust-aino', 24, '2026-11-05');
    await giveBack(
      contract,
      'cust-aino',
      contract.endDate,
      { condition: 'good', value: 2_000 },
      'pass_on',
      'cust-lena'
    );
    expect((await getAsset(holder.db, 'ebike-003'))?.status).toBe('reserved');
    const preview = await previewAssessment(holder.db, 'ebike-003', contract.endDate);
    expect(preview).toMatchObject({ ok: false, reason: { code: 'asset_not_returned' } });
  });

  it('bought: the item left the loop, the page has nothing to preview and the route says 409', async () => {
    const contract = await lease('ebike-003', 'cust-aino', 24, '2026-11-05');
    await payRents(holder.db, contract.id, 24, 'cust-aino');
    await giveBack(
      contract,
      'cust-aino',
      contract.endDate,
      { condition: 'good', value: 2_000 },
      'buy'
    );
    const preview = await previewAssessment(holder.db, 'ebike-003', contract.endDate);
    expect(preview).toMatchObject({ ok: false, reason: { code: 'asset_not_returned' } });
    const { status, body } = await assessViaRoute('ebike-003', contract.endDate);
    expect(status).toBe(409);
    expect(body.error.details).toMatchObject({
      code: 'asset_not_returned',
      params: { status: 'sold' },
    });
  });
});

describe('a second return: the third life', () => {
  it('ebike-003 returned, relisted, leased again, returned again and relisted: three lives on the passport', async () => {
    const first = await lease('ebike-003', 'cust-aino', 12, '2026-11-05');
    await giveBack(first, 'cust-aino', first.endDate, { condition: 'good', value: 1_500 });
    const one = await pageThenAssess('ebike-003', first.endDate);

    const second = await lease('ebike-003', 'cust-lena', 12, first.endDate);
    await giveBack(second, 'cust-lena', second.endDate, { condition: 'fair', value: 4_000 });
    const two = await pageThenAssess('ebike-003', second.endDate);
    expect(two.data.contractId).toBe(second.id);
    // D60: still valued from the first lease's list price, aged from its start: 23 whole months
    // on the second term's last day, not 11 since the second lease began.
    expect(two.stored.input.newPriceCents).toBe(first.unitListPriceCents);
    expect(two.stored.assessment.ageMonths).toBe(23);
    expect(two.data.id).not.toBe(one.data.id);

    const third = await lease('ebike-003', 'cust-mikko', 12, second.endDate);
    const listed = (await listAssetsWithLives(holder.db)).find((a) => a.id === 'ebike-003');
    expect(listed).toMatchObject({ status: 'leased', previous_lives: 2 });
    const read = await readPassport(holder.db, 'ebike-003', second.endDate);
    expect(read?.passport.lives.map((l) => l.contractId)).toEqual([first.id, second.id, third.id]);
    // #73: each later life is charged what its assessment spent before it.
    expect(read?.money.perLifeCents).toHaveLength(3);
    await expect(readFleetImpact(holder.db, second.endDate)).resolves.toBeDefined();
  });
});
