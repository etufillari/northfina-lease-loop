// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/test-db';
import { currentDate, getAppDate, setDemoDate } from './app-date';
import type { PrismaClient } from '../prisma-client';
import { todayIso } from './today';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.appSetting.deleteMany();
});

describe('the app date', () => {
  it('is the real date when no demo date is set', async () => {
    expect(await getAppDate(db)).toEqual({ date: todayIso(), is_demo: false });
    expect(await currentDate(db)).toBe(todayIso());
  });

  it('uses the demo date once it is set', async () => {
    const result = await setDemoDate(db, { date: '2026-11-05', actor: 'staff-admin' });
    expect(result).toEqual({ date: '2026-11-05', is_demo: true });
    expect(await currentDate(db)).toBe('2026-11-05');
  });

  it('replaces an earlier demo date', async () => {
    await setDemoDate(db, { date: '2026-11-05', actor: 'staff-admin' });
    await setDemoDate(db, { date: '2026-11-06', actor: 'staff-admin' });
    expect(await currentDate(db)).toBe('2026-11-06');
    expect(await db.appSetting.count()).toBe(1);
  });

  it('goes back to the real date when cleared', async () => {
    await setDemoDate(db, { date: '2026-11-05', actor: 'staff-admin' });
    const result = await setDemoDate(db, { date: null, actor: 'staff-admin' });
    expect(result).toEqual({ date: todayIso(), is_demo: false });
  });

  it('can clear when nothing is set', async () => {
    const result = await setDemoDate(db, { date: null, actor: 'staff-admin' });
    expect(result.is_demo).toBe(false);
  });

  it('records each change in the audit log', async () => {
    await setDemoDate(db, { date: '2026-11-05', actor: 'staff-admin' });
    await setDemoDate(db, { date: null, actor: 'staff-admin' });

    const rows = await db.auditLog.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => row.action)).toEqual(['demo_date.changed', 'demo_date.changed']);
    expect(rows[0]?.actor).toBe('staff-admin');
    expect(JSON.parse(rows[0]?.details_json ?? '')).toEqual({ from: null, to: '2026-11-05' });
    expect(JSON.parse(rows[1]?.details_json ?? '')).toEqual({ from: '2026-11-05', to: null });
  });

  it('throws on a stored value that is not a date', async () => {
    await db.appSetting.create({ data: { key: 'demo_date', value: 'not-a-date' } });
    await expect(getAppDate(db)).rejects.toThrow();
  });
});
