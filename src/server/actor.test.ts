// The actor (D17): no login, a cookie names who is acting. Pure parts first, then the reader
// against a real, migrated SQLite database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  ACTOR_COOKIE,
  actorCookieHeader,
  actorFromCookieValue,
  clearActorCookieHeader,
  resolveActor,
} from './actor';
import { actorBodySchema } from './routes';
import { seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';

const known = ['cust-aino', 'cust-kettukoodi'];

describe('actorFromCookieValue', () => {
  it('returns a known customer id as it is', () => {
    expect(actorFromCookieValue('cust-aino', known)).toBe('cust-aino');
  });

  it('returns admin for admin', () => {
    expect(actorFromCookieValue('admin', known)).toBe('admin');
  });

  it('falls back to anonymous for an unknown id', () => {
    expect(actorFromCookieValue('cust-nobody', known)).toBe('anonymous');
  });

  it('falls back to anonymous for an empty, blank or missing cookie', () => {
    expect(actorFromCookieValue('', known)).toBe('anonymous');
    expect(actorFromCookieValue('   ', known)).toBe('anonymous');
    expect(actorFromCookieValue(undefined, known)).toBe('anonymous');
  });

  it('does not trim, change case or accept anonymous as a chosen actor', () => {
    expect(actorFromCookieValue(' cust-aino', known)).toBe('anonymous');
    expect(actorFromCookieValue('Admin', known)).toBe('anonymous');
    expect(actorFromCookieValue('anonymous', known)).toBe('anonymous');
  });

  it('knows no customer when the list is empty', () => {
    expect(actorFromCookieValue('cust-aino', [])).toBe('anonymous');
    expect(actorFromCookieValue('admin', [])).toBe('admin');
  });
});

describe('the cookie headers', () => {
  it('sets the actor cookie for the whole site, http only, for 30 days', () => {
    expect(actorCookieHeader('cust-aino')).toBe(
      `${ACTOR_COOKIE}=cust-aino; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`
    );
  });

  it('encodes a value that is not cookie-safe', () => {
    expect(actorCookieHeader('a b;c')).toContain(`${ACTOR_COOKIE}=a%20b%3Bc;`);
  });

  it('clears the cookie by expiring it', () => {
    expect(clearActorCookieHeader()).toBe(
      `${ACTOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
  });
});

describe('actorBodySchema', () => {
  it('accepts { actor } and nothing else', () => {
    expect(actorBodySchema.parse({ actor: 'admin' })).toEqual({ actor: 'admin' });
    expect(actorBodySchema.safeParse({ actor: '' }).success).toBe(false);
    expect(actorBodySchema.safeParse({ actor: 'admin', extra: 1 }).success).toBe(false);
    expect(actorBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('resolveActor', () => {
  let db: PrismaClient;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    await seedCustomers(db, await loadCustomers());
  });
  afterAll(async () => {
    await cleanup();
  });

  it('checks the cookie value against the customers in the database', async () => {
    expect(await resolveActor(db, 'cust-lena')).toBe('cust-lena');
    expect(await resolveActor(db, 'admin')).toBe('admin');
    expect(await resolveActor(db, 'cust-deleted')).toBe('anonymous');
    expect(await resolveActor(db, undefined)).toBe('anonymous');
  });
});
