import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ADMIN_ADDRESS, customerAddress } from '@/domain/notifications';
import { publish } from '@/server/notifications/bus';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../tests/helpers/act-as';
import { GET } from './route';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const decoder = new TextDecoder();
let abort = new AbortController();

beforeAll(() => {
  vi.stubEnv('JWT_SECRET', TEST_SECRET);
});
afterAll(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  abort.abort();
});

async function connect() {
  abort = new AbortController();
  const response = await GET(
    new Request('http://localhost/api/notifications/stream', { signal: abort.signal }),
    undefined
  );
  const reader = response.body?.getReader();
  if (!reader) throw new Error('expected a stream');
  await reader.read();
  return { response, reader };
}

const read = async (reader: ReadableStreamDefaultReader<Uint8Array>) =>
  decoder.decode((await reader.read()).value);

describe('GET /api/notifications/stream', () => {
  it('needs a login, and answers with the normal error', async () => {
    await actAs(null);
    const response = await GET(new Request('http://localhost/x'), undefined);

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('NOT_LOGGED_IN');
  });

  it('is an uncached event stream', async () => {
    await actAs(AINO);
    const { response } = await connect();

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toContain('no-transform');
  });

  it('sends a customer their own notification, as one SSE message', async () => {
    await actAs(AINO);
    const { reader } = await connect();

    publish({ to: customerAddress(AINO.sub), kind: 'hold_ended', item: 'Bike' });

    expect(await read(reader)).toBe('data: {"kind":"hold_ended","item":"Bike"}\n\n');
  });

  it("does not send a customer someone else's notification", async () => {
    await actAs(AINO);
    const { reader } = await connect();

    publish({ to: customerAddress('cust-lena'), kind: 'hold_ended', item: 'Secret' });
    publish({ to: customerAddress(AINO.sub), kind: 'hold_ended', item: 'Mine' });

    expect(await read(reader)).toContain('Mine');
  });

  it('sends an admin the review queue', async () => {
    await actAs(ADMIN);
    const { reader } = await connect();

    publish({ to: ADMIN_ADDRESS, kind: 'review_waiting', item: 'Tractor' });

    expect(await read(reader)).toContain('review_waiting');
  });

  it('sends a dealer nothing', async () => {
    await actAs(DEALER);
    const { reader } = await connect();

    publish({ to: ADMIN_ADDRESS, kind: 'review_waiting', item: 'Tractor' });
    abort.abort();

    expect((await reader.read()).done).toBe(true);
  });

  it('stops listening when the tab closes, and publishing still works', async () => {
    await actAs(AINO);
    const { reader } = await connect();

    abort.abort();

    expect((await reader.read()).done).toBe(true);
    expect(() =>
      publish({ to: customerAddress(AINO.sub), kind: 'hold_ended', item: 'Bike' })
    ).not.toThrow();
  });
});
