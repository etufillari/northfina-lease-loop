import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createDraftStore, decodeDraft } from './draft-store';

describe('draft durability failures', () => {
  it('continues in RAM when even the sessionStorage getter throws', () => {
    const store = createDraftStore(() => {
      throw new Error('SecurityError');
    });
    expect(store.snapshot('a')).toBe('1:');
    store.write('a', '{"income":"1.0"}');
    expect(store.snapshot('a')).toBe('1:{"income":"1.0"}');
    expect(store.snapshot('a')).toBe(store.snapshot('a'));
  });
  it('does not reload stale disk values after quota failure and can recover on a later write', () => {
    let fail = true;
    const values = new Map([['a', 'old']]);
    const store = createDraftStore(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (fail) throw new Error('QuotaExceededError');
        values.set(key, value);
      },
    }));
    expect(store.snapshot('a')).toBe('0:old');
    store.write('a', 'new');
    expect(values.get('a')).toBe('old');
    expect(store.snapshot('a')).toBe('1:new');
    fail = false;
    store.write('a', 'newer');
    expect(store.snapshot('a')).toBe('0:newer');
    expect(values.get('a')).toBe('newer');
  });
  it('preserves the last known value if reading is later revoked', () => {
    let fail = false;
    const store = createDraftStore(() => ({
      getItem() {
        if (fail) throw new Error('blocked');
        return 'saved';
      },
      setItem() {},
    }));
    expect(store.snapshot('a')).toBe('0:saved');
    fail = true;
    expect(store.snapshot('a')).toBe('1:saved');
  });
  it('separates persona/asset keys in RAM', () => {
    const store = createDraftStore(() => {
      throw new Error('blocked');
    });
    store.write('aino:bike', 'A');
    store.write('lena:bike', 'B');
    expect(store.snapshot('aino:bike')).toBe('1:A');
    expect(store.snapshot('lena:bike')).toBe('1:B');
  });
  it('validates stored JSON and accepts zero instead of treating it as absence', () => {
    expect(decodeDraft('0:{', 7, z.number())).toBe(7);
    expect(decodeDraft('0:"invalid"', 7, z.number())).toBe(7);
    expect(decodeDraft('1:0', 7, z.number())).toBe(0);
  });
});
