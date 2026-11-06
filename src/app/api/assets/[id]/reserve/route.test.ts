import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { seedAssets } from '@/server/assets';
import { db } from '@/server/db';
import { createTestDb } from '../../../../../../tests/helpers/test-db';
import { PATCH as patchStatus } from '../status/route';
import { DELETE, GET, POST } from './route';

let cleanup: () => Promise<void>;
let dataPack: Asset[];

beforeAll(async () => {
  ({ cleanup } = await createTestDb());
  dataPack = await loadAssets();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.assetReservation.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, dataPack);
});

function post(id: string, body: unknown) {
  const request = new Request(`http://localhost/api/assets/${id}/reserve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

function del(id: string, body: unknown) {
  const request = new Request(`http://localhost/api/assets/${id}/reserve`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
  return DELETE(request, { params: Promise.resolve({ id }) });
}

function get(id: string, token?: string) {
  const url = `http://localhost/api/assets/${id}/reserve${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const request = new Request(url, { method: 'GET' });
  return GET(request, { params: Promise.resolve({ id }) });
}

function patch(id: string, body: unknown) {
  const request = new Request(`http://localhost/api/assets/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return patchStatus(request, { params: Promise.resolve({ id }) });
}

describe('POST /api/assets/:id/reserve', () => {
  it('reserves an available asset and writes audit log', async () => {
    const res = await post('ebike-001', { actor: 'customer-aino' });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.reservation.assetId).toBe('ebike-001');
    expect(json.data.reservation.token).toBeDefined();
    expect(json.data.renewed).toBe(false);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { entity_id: 'ebike-001', action: 'asset.reserved' },
    });
    expect(audit.actor).toBe('customer-aino');
  });

  it('rejects concurrent reservations with 409 ASSET_RESERVED', async () => {
    const first = await post('ebike-001', { actor: 'customer-1' });
    expect(first.status).toBe(200);

    const second = await post('ebike-001', { actor: 'customer-2' });
    const json = await second.json();

    expect(second.status).toBe(409);
    expect(json).toMatchObject({
      success: false,
      error: {
        code: 'ASSET_RESERVED',
        details: { assetId: 'ebike-001' },
      },
    });
  });

  it('renews reservation if same token is supplied', async () => {
    const first = await post('ebike-001', { actor: 'customer-1' });
    const firstJson = await first.json();
    const token = firstJson.data.reservation.token;

    const renew = await post('ebike-001', { actor: 'customer-1', token });
    const renewJson = await renew.json();

    expect(renew.status).toBe(200);
    expect(renewJson.data.renewed).toBe(true);
    expect(renewJson.data.reservation.token).toBe(token);
  });

  it('returns 404 for unknown asset id', async () => {
    const res = await post('unknown-id', { actor: 'customer' });
    expect(res.status).toBe(404);
  });

  it('generates a fresh token when re-reserving after a released or expired reservation', async () => {
    const first = await post('ebike-001', { actor: 'customer-1' });
    const firstJson = await first.json();
    const oldToken = firstJson.data.reservation.token;

    const released = await del('ebike-001', { token: oldToken, reason: 'rejected' });
    expect(released.status).toBe(200);

    const second = await post('ebike-001', { actor: 'customer-1', token: oldToken });
    const secondJson = await second.json();

    expect(second.status).toBe(200);
    expect(secondJson.success).toBe(true);
    expect(secondJson.data.renewed).toBe(false);
    expect(secondJson.data.reservation.token).not.toBe(oldToken);
  });
});

describe('DELETE /api/assets/:id/reserve', () => {
  it('releases active reservation and sets asset available', async () => {
    const create = await post('ebike-001', { actor: 'customer' });
    const createJson = await create.json();
    const token = createJson.data.reservation.token;

    const res = await del('ebike-001', { token, reason: 'cancelled' });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.released).toBe(true);

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } });
    expect(asset.status).toBe('available');
  });

  it('returns 403 on token mismatch', async () => {
    await post('ebike-001', { actor: 'customer' });
    const res = await del('ebike-001', { token: 'wrong-token' });
    expect(res.status).toBe(403);
  });

  it('rejects signing when applicant token was released and another applicant reserved the asset', async () => {
    const resA = await post('ebike-001', { actor: 'alice' });
    const tokenA = (await resA.json()).data.reservation.token;

    // Alice is rejected and releases her reservation
    await del('ebike-001', { token: tokenA, reason: 'rejected' });

    // Bob reserves the asset
    const resB = await post('ebike-001', { actor: 'bob' });
    expect(resB.status).toBe(200);

    // Alice tries to sign using her released tokenA
    const signA = await patch('ebike-001', { status: 'reserved', actor: 'alice', token: tokenA });
    expect(signA.status).toBe(409);
  });
});

describe('GET /api/assets/:id/reserve', () => {
  it('returns active: false when no reservation exists', async () => {
    const res = await get('ebike-001');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.active).toBe(false);
    expect(json.data.reservation).toBeNull();
  });

  it('returns reservation status and recognizes holder by token', async () => {
    const create = await post('ebike-001', { actor: 'customer' });
    const createJson = await create.json();
    const token = createJson.data.reservation.token;

    const holderCheck = await get('ebike-001', token);
    const holderJson = await holderCheck.json();
    expect(holderJson.data.active).toBe(true);
    expect(holderJson.data.reservation.isHolder).toBe(true);
    expect(holderJson.data.reservation.remainingSeconds).toBeGreaterThan(0);

    const otherCheck = await get('ebike-001', 'other-token');
    const otherJson = await otherCheck.json();
    expect(otherJson.data.active).toBe(true);
    expect(otherJson.data.reservation.isHolder).toBe(false);
  });
});
