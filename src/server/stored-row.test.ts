import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorToResponse } from './api-response';
import { CorruptRowError, parseStoredJson, parseStoredValue } from './stored-row';

const schema = z.strictObject({ rentCents: z.number().int() });
const where = { table: 'contract', id: 7 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseStoredJson', () => {
  it('returns the parsed value when the row matches its schema', () => {
    expect(parseStoredJson(schema, '{"rentCents":10730}', where)).toEqual({ rentCents: 10_730 });
  });

  it.each([
    ['not JSON at all', '{rentCents:'],
    ['the wrong shape', '{"rentCents":"10730"}'],
    ['an extra field', '{"rentCents":10730,"x":1}'],
  ])('throws CorruptRowError for %s, naming the row', (_label, json) => {
    expect(() => parseStoredJson(schema, json, where)).toThrow(CorruptRowError);
    expect(() => parseStoredJson(schema, json, where)).toThrow('contract 7');
  });
});

describe('parseStoredValue', () => {
  it('checks a stored column against its schema', () => {
    expect(parseStoredValue(z.enum(['good', 'fair']), 'good', where)).toBe('good');
    expect(() => parseStoredValue(z.enum(['good', 'fair']), 'shiny', where)).toThrow(
      CorruptRowError
    );
  });
});

describe('a corrupt row through handleRoute', () => {
  it('is a generic 500, not a 400 validation error, and the row never reaches the client', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let error: unknown;
    try {
      parseStoredJson(schema, '{"rentCents":"secret-row-content"}', where);
    } catch (thrown) {
      error = thrown;
    }
    const response = errorToResponse(error);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: unknown };
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
  });
});
