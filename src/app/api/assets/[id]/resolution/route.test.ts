import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/data/schemas';
import { POST } from './route';

const mockAsset: Asset = {
  id: 'ebike-001',
  category: 'e_bike',
  make: 'Katu',
  model: 'City 1',
  model_year: 2024,
  serial_number: 'SN-001',
  condition: 'good',
  usage: { unit: 'km', value: 1200 },
  previous_lives: 0,
  status: 'sold',
};

vi.mock('@/server/assets', () => ({
  resolveAssetEndOfTerm: vi.fn(async (_db, input) => {
    if (input.id === 'unknown-id') {
      return { ok: false, reason: 'not_found' };
    }
    return {
      ok: true,
      asset: {
        ...mockAsset,
        id: input.id,
        status: input.action === 'buyout' ? 'sold' : 'returned',
      },
    };
  }),
}));

vi.mock('@/server/db', () => ({
  db: {},
}));

function post(id: string, body: unknown) {
  const request = new Request(`http://localhost/api/assets/${id}/resolution`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

describe('POST /api/assets/[id]/resolution', () => {
  it('resolves buyout: sets asset to sold and returns ok', async () => {
    const res = await post('ebike-001', {
      action: 'buyout',
      actor: 'customer-test',
      details: { buyoutNetCents: 58350, grossCents: 73229 },
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('sold');
  });

  it('resolves pass_on: sets asset to returned', async () => {
    const res = await post('laptop-001', {
      action: 'pass_on',
      actor: 'customer-test',
      details: { matchedWaitlistId: 'wait-05', avoidedCo2Kg: 50.2 },
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('returned');
  });

  it('returns 404 for unknown asset', async () => {
    const res = await post('unknown-id', { action: 'return' });
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('ASSET_NOT_FOUND');
  });

  it('rejects invalid action body with 400', async () => {
    const res = await post('ebike-001', { action: 'invalid_action' });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
