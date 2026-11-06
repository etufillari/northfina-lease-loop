import { afterEach, describe, expect, it, vi } from 'vitest';
import { postReturnAction, readEnvelope } from './post-return-action';

describe('readEnvelope', () => {
  it('reads a success envelope', () => {
    expect(readEnvelope({ success: true, data: {}, meta: {} })).toEqual({ ok: true });
  });

  it('reads the error code from a failure envelope', () => {
    expect(
      readEnvelope({ success: false, error: { code: 'RETURN_NOT_RECEIVED', message: 'x' } })
    ).toEqual({ ok: false, code: 'RETURN_NOT_RECEIVED' });
  });

  it('treats anything else as an unknown failure', () => {
    expect(readEnvelope(null)).toEqual({ ok: false, code: 'UNKNOWN' });
    expect(readEnvelope('oops')).toEqual({ ok: false, code: 'UNKNOWN' });
    expect(readEnvelope({ success: false })).toEqual({ ok: false, code: 'UNKNOWN' });
    expect(readEnvelope({ success: false, error: { code: 42 } })).toEqual({
      ok: false,
      code: 'UNKNOWN',
    });
  });
});

describe('postReturnAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts JSON and returns the envelope result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await postReturnAction('/api/returns/r1/receive', { actor: 'dealer' })).toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/returns/r1/receive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"actor":"dealer"}',
    });
  });

  it('returns the error code of a failed call', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ success: false, error: { code: 'RETURN_NOT_RECEIVED' } }, { status: 409 })
        )
    );

    expect(await postReturnAction('/x', {})).toEqual({ ok: false, code: 'RETURN_NOT_RECEIVED' });
  });

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    expect(await postReturnAction('/x', {})).toEqual({ ok: false, code: 'NETWORK' });
  });

  it('reports a reply that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })));

    expect(await postReturnAction('/x', {})).toEqual({ ok: false, code: 'UNKNOWN' });
  });
});
