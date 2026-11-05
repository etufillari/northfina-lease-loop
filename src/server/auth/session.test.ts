import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  SESSION_MAX_AGE_SECONDS,
  signSession,
  verifySession,
  type SessionPayload,
} from './session';

const secret = 'test-secret-at-least-this-long';
const payload: SessionPayload = { sub: 'cust-aino', role: 'client' };
const issuedAt = new Date('2026-11-05T12:00:00.000Z');

describe('signSession and verifySession', () => {
  it('verifies a token it just signed, with the same payload', async () => {
    const token = await signSession(payload, secret, issuedAt);
    const result = await verifySession(token, secret, issuedAt);
    expect(result).toEqual({ ok: true, payload });
  });

  it('is still valid one second before it expires', async () => {
    const token = await signSession(payload, secret, issuedAt);
    const almostExpired = new Date(issuedAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000 - 1000);
    expect(await verifySession(token, secret, almostExpired)).toMatchObject({ ok: true });
  });

  it('reports "expired" once SESSION_MAX_AGE_SECONDS has passed', async () => {
    const token = await signSession(payload, secret, issuedAt);
    const afterExpiry = new Date(issuedAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000 + 1000);
    expect(await verifySession(token, secret, afterExpiry)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('reports "invalid" for the wrong secret', async () => {
    const token = await signSession(payload, secret, issuedAt);
    expect(await verifySession(token, 'a-completely-different-secret', issuedAt)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('reports "invalid" for a tampered token', async () => {
    const token = await signSession(payload, secret, issuedAt);
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(await verifySession(tampered, secret, issuedAt)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('reports "invalid" for garbage input', async () => {
    expect(await verifySession('not-a-jwt', secret, issuedAt)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('reports "invalid" for a well-signed token carrying a role that does not exist', async () => {
    // Built by hand (not through signSession) to simulate a token that is correctly signed
    // but whose role is not one `isRole` recognises, e.g. after a role was renamed.
    const token = await new SignJWT({ sub: 'staff-dealer', role: 'superadmin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(issuedAt)
      .setExpirationTime(new Date(issuedAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000))
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(token, secret, issuedAt)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('reports "invalid" for a well-signed token with no sub', async () => {
    const token = await new SignJWT({ role: 'client' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(issuedAt)
      .setExpirationTime(new Date(issuedAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000))
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(token, secret, issuedAt)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('defaults to the real clock when now is not given', async () => {
    const token = await signSession(payload, secret);
    expect(await verifySession(token, secret)).toEqual({ ok: true, payload });
  });
});
