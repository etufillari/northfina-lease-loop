import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ApiError, errorToResponse } from './api-response';
import { requestHash, requireSameRequest, rethrowDatabaseConflict } from './request-integrity';

describe('requestHash', () => {
  it('hashes canonical JSON with SHA-256', () => {
    expect(requestHash({ b: 2, a: 1 })).toBe(
      '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777'
    );
  });

  it('sorts nested objects including those inside arrays without changing input', () => {
    const first = { answers: { q_owners: [{ b: 2, a: 1 }], q_income: 100 }, requestId: 'id' };
    const second = { requestId: 'id', answers: { q_income: 100, q_owners: [{ a: 1, b: 2 }] } };
    const before = JSON.stringify(first);
    expect(requestHash(first)).toBe(requestHash(second));
    expect(JSON.stringify(first)).toBe(before);
  });

  it('uses code-unit key ordering independent of language-specific collation', () => {
    const canonical = '{"Z":2,"_":3,"a":4,"z":1,"ä":5}';
    expect(requestHash({ z: 1, Z: 2, _: 3, a: 4, ä: 5 })).toBe(
      createHash('sha256').update(canonical).digest('hex')
    );
  });

  it.each([
    [{ amount: 0 }, { amount: 1000 }],
    [{ amount: 1 }, { amount: '1' }],
    [{ owners: ['A', 'B'] }, { owners: ['B', 'A'] }],
    [{ value: null }, {}],
    [{ value: true }, { value: false }],
  ])('distinguishes different JSON payloads: %o and %o', (first, second) => {
    expect(requestHash(first)).not.toBe(requestHash(second));
  });

  it('retains an own __proto__ key as data', () => {
    const payload: unknown = JSON.parse('{"__proto__":{"q_value":"data"},"a":1}');
    expect(requestHash(payload)).not.toBe(requestHash({ a: 1 }));
    expect(Object.hasOwn(Object.prototype, 'q_value')).toBe(false);
  });
});

describe('retry guards', () => {
  it('accepts the same request and rejects changed or absent stored evidence', () => {
    const hash = requestHash({ amount: 100 });
    expect(() => requireSameRequest(hash, requestHash({ amount: 100 }))).not.toThrow();
    for (const stored of [null, requestHash({ amount: 101 })]) {
      expect(() => requireSameRequest(stored, hash)).toThrow(
        expect.objectContaining({ status: 409, code: 'IDEMPOTENCY_CONFLICT' })
      );
    }
  });

  it.each(['P2002', 'P2034', 'P2028'])(
    'maps database conflict %s to a safe API error',
    async (code) => {
      const error = Object.assign(new Error('internal SQL details'), { code });
      let converted: unknown;
      try {
        rethrowDatabaseConflict(error);
      } catch (caught) {
        converted = caught;
      }
      expect(converted).toBeInstanceOf(ApiError);
      expect(converted).toMatchObject({ status: 409, code: 'RETRY_REQUEST' });
      const response = errorToResponse(converted);
      expect(response.status).toBe(409);
      expect(await response.text()).not.toContain('internal SQL details');
    }
  );

  it.each([
    new Error('unexpected'),
    Object.assign(new Error('foreign key'), { code: 'P2003' }),
    { code: 'P2002' },
    null,
    'unexpected',
  ])('rethrows unrelated failures without changing them: %o', (error) => {
    let caught: unknown = Symbol('not thrown');
    try {
      rethrowDatabaseConflict(error);
    } catch (value) {
      caught = value;
    }
    expect(caught).toBe(error);
  });
});
