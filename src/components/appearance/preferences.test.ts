import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appearanceInit, appearanceKey, parseAppearance } from './preferences';

const examples = [
  { raw: null, design: 'green', mode: 'system' },
  { raw: 'invalid', design: 'green', mode: 'system' },
  { raw: 'null', design: 'green', mode: 'system' },
  { raw: '[]', design: 'green', mode: 'system' },
  { raw: '{"design":"northfina","mode":"dark"}', design: 'northfina', mode: 'dark' },
  { raw: '{"design":"green","mode":"light"}', design: 'green', mode: 'light' },
  { raw: '{"design":"<script>","mode":42}', design: 'green', mode: 'system' },
];

describe('appearance preferences', () => {
  it.each(examples)('validates persisted data: $raw', ({ raw, design, mode }) => {
    expect(parseAppearance(raw)).toEqual({ design, mode });
  });

  it.each(examples)('applies the same validation before first paint: $raw', ({ raw }) => {
    const dataset: Record<string, string> = {};
    runInNewContext(appearanceInit, {
      document: { documentElement: { dataset } },
      localStorage: { getItem: (key: string) => (key === appearanceKey ? raw : null) },
      matchMedia: () => ({ matches: true }),
    });
    const expected = parseAppearance(raw);
    expect(dataset.design).toBe(expected.design);
    expect(dataset.mode).toBe(expected.mode);
    expect(dataset.theme).toBe(expected.mode === 'system' ? 'dark' : expected.mode);
  });

  it('keeps a usable system theme when browser storage is blocked', () => {
    const dataset: Record<string, string> = {};
    runInNewContext(appearanceInit, {
      document: { documentElement: { dataset } },
      localStorage: {
        getItem: () => {
          throw new Error('Storage is blocked');
        },
      },
      matchMedia: () => ({ matches: false }),
    });
    expect(dataset).toEqual({
      design: 'green',
      mode: 'system',
      theme: 'light',
      appearanceVolatile: 'true',
    });
  });
});
