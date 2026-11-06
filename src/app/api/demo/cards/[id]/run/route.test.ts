// POST /api/demo/cards/:id/run against a real, migrated SQLite database: the app's `db` module
// is pointed at it and seeded with the pack, nothing else is replaced. The run answers its steps and landing page and
// sets the demo clock and actor cookies; a second click is 409 with the earlier page (D70).
// With the demo tools off (D74, `DEMO_TOOLS=0`) it answers 404 and runs nothing.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../../../../../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../../../../../../tests/helpers/test-db';
import { ACTOR_COOKIE } from '@/server/actor';
import { DEMO_CLOCK_COOKIE } from '@/server/demo-clock';
import type { PrismaClient } from '@/server/prisma-client';

const holder = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const { POST } = await import('./route');

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
  await seedPack(holder.db);
});
afterAll(async () => {
  await cleanup();
});

async function run(id: string) {
  const request = new Request(`http://localhost/api/demo/cards/${id}/run`, { method: 'POST' });
  const response = await POST(request, { params: Promise.resolve({ id }) });
  return {
    status: response.status,
    cookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

describe('POST /api/demo/cards/[id]/run with the demo tools off (D74)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 404, sets no cookie and writes nothing', async () => {
    vi.stubEnv('DEMO_TOOLS', '0');
    const before = await holder.db.auditLog.count();
    const { status, cookies, body } = await run('5');
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(cookies).toEqual([]);
    expect(await holder.db.auditLog.count()).toBe(before);
  });
});

describe('POST /api/demo/cards/[id]/run', () => {
  it('runs card 5, sets the clock and the actor, and names the application page', async () => {
    const { status, cookies, body } = await run('5');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      cardId: 5,
      today: '2026-11-05',
      actor: 'cust-mikko',
      landing: expect.stringMatching(/^\/applications\//),
    });
    expect(cookies).toEqual([
      expect.stringMatching(new RegExp(`^${DEMO_CLOCK_COOKIE}=2026-11-05;`)),
      expect.stringMatching(new RegExp(`^${ACTOR_COOKIE}=cust-mikko;`)),
    ]);
  });

  it('answers a second click with 409 CARD_ALREADY_RUN and the same page', async () => {
    const first = await run('7');
    const again = await run('7');
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({
      code: 'CARD_ALREADY_RUN',
      details: {
        code: 'card_already_run',
        params: { cardId: 7 },
        landing: first.body.data.landing,
      },
    });
    expect(again.cookies).toHaveLength(2);
  });

  it.each(['0', '11', 'one', '1.5'])('refuses card %s with 400', async (id) => {
    expect((await run(id)).status).toBe(400);
  });
});
