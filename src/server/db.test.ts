import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generatedClass: class CurrentClient {},
  fresh: { $disconnect: vi.fn().mockResolvedValue(undefined) },
  create: vi.fn(),
}));
vi.mock('@/generated/prisma/client', () => ({ PrismaClient: mocks.generatedClass }));
vi.mock('./prisma-client', () => ({ createPrismaClient: mocks.create }));

const cache = globalThis as typeof globalThis & {
  leaseLoopDb?: unknown;
  leaseLoopDbClientClass?: unknown;
};
const originalDb = cache.leaseLoopDb;
const originalClass = cache.leaseLoopDbClientClass;

afterEach(() => {
  cache.leaseLoopDb = originalDb;
  cache.leaseLoopDbClientClass = originalClass;
  vi.resetModules();
  vi.clearAllMocks();
});

describe('development Prisma client cache', () => {
  it('replaces a cached client from an older generated schema and reuses the current one', async () => {
    const stale = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    cache.leaseLoopDb = stale;
    cache.leaseLoopDbClientClass = class OldClient {};
    mocks.create.mockReturnValue(mocks.fresh);

    const first = await import('./db');
    expect(first.db).toBe(mocks.fresh);
    expect(stale.$disconnect).toHaveBeenCalledOnce();
    vi.resetModules();
    const second = await import('./db');
    expect(second.db).toBe(mocks.fresh);
    expect(mocks.create).toHaveBeenCalledOnce();
  });
});
