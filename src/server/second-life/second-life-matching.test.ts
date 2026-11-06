import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../../tests/helpers/test-db';
import { seedAssets } from '../assets/assets';
import { acceptSecondLifeMatch, previewSecondLifeMatches } from './second-life-matching';
import type { PrismaClient } from '../prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Asset[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadAssets();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.assetHistory.deleteMany();
  await db.secondLifeMatch.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, dataPack);
  await db.asset.update({
    where: { id: 'ebike-007' },
    data: { status: 'available', condition: 'good', usage_value: 0 },
  });
});

describe('previewSecondLifeMatches', () => {
  it('returns ranked matches without writing state', async () => {
    const result = await previewSecondLifeMatches(db, 'ebike-007', {
      availableOn: '2026-11-06',
    });

    expect(result).toMatchObject({
      ok: true,
      preview: {
        asset: { id: 'ebike-007', status: 'available' },
        matches: expect.arrayContaining([
          expect.objectContaining({ request: expect.objectContaining({ id: 'wait-13' }) }),
        ]),
      },
    });
    expect(await db.secondLifeMatch.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('does not offer a request that has already been matched elsewhere', async () => {
    const accepted = await acceptSecondLifeMatch(db, 'ebike-007', {
      requestId: 'wait-13',
      availableOn: '2026-11-06',
      actor: 'team-test',
    });
    expect(accepted).toMatchObject({ ok: true });

    await db.asset.update({ where: { id: 'ebike-008' }, data: { status: 'available' } });
    const result = await previewSecondLifeMatches(db, 'ebike-008', {
      availableOn: '2026-11-06',
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.preview.matches.some((match) => match.request.id === 'wait-13')).toBe(false);
  });
});

describe('acceptSecondLifeMatch', () => {
  it('reserves the asset and writes a match, passport event and audit row atomically', async () => {
    const result = await acceptSecondLifeMatch(db, 'ebike-007', {
      requestId: 'wait-13',
      availableOn: '2026-11-06',
      actor: 'team-test',
    });

    expect(result).toMatchObject({
      ok: true,
      asset: {
        id: 'ebike-007',
        status: 'reserved',
        first_leased_on: '2023-01-01',
        original_list_price_cents: 549000,
      },
      match: {
        requestId: 'wait-13',
        status: 'accepted',
        pricing: { termMonths: 24 },
      },
    });
    expect(await db.secondLifeMatch.count()).toBe(1);
    expect(await db.assetHistory.findFirstOrThrow()).toMatchObject({
      asset_id: 'ebike-007',
      event_type: 'matched',
      from_status: 'available',
      to_status: 'reserved',
    });
    expect(await db.auditLog.findFirstOrThrow()).toMatchObject({
      action: 'asset.second_life_matched',
      entity_type: 'asset',
      entity_id: 'ebike-007',
    });
  });

  it('rejects a request that was already accepted', async () => {
    await acceptSecondLifeMatch(db, 'ebike-007', {
      requestId: 'wait-13',
      availableOn: '2026-11-06',
      actor: 'team-test',
    });

    await expect(
      acceptSecondLifeMatch(db, 'ebike-008', {
        requestId: 'wait-13',
        availableOn: '2026-11-06',
        actor: 'team-test',
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: 'request_already_matched',
    });
  });

  it('does not change a returned asset or write an audit row', async () => {
    await db.asset.update({ where: { id: 'ebike-007' }, data: { status: 'returned' } });

    await expect(
      acceptSecondLifeMatch(db, 'ebike-007', {
        requestId: 'wait-13',
        availableOn: '2026-11-06',
        actor: 'team-test',
      })
    ).resolves.toMatchObject({ ok: false, reason: 'asset_not_available' });
    expect(await db.secondLifeMatch.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });
});
