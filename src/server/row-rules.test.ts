import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { quoteRowSchema } from '@/domain/rows/quote';
import { quoteRow } from '../../tests/helpers/row-examples';
import { errorToResponse } from './api-response';
import { parseRow, parseStoredJson, RowRuleError } from './row-rules';

describe('parseRow: a row that breaks its write schema is a server bug (D27)', () => {
  it('returns the parsed row', () => {
    expect(parseRow('quote', quoteRowSchema, quoteRow())).toEqual(quoteRow());
  });

  it('throws a RowRuleError, not a ZodError, naming the table and the issues', () => {
    const bad = { ...quoteRow(), asset_id: '' };
    let thrown: unknown;
    try {
      parseRow('quote', quoteRowSchema, bad);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RowRuleError);
    expect(thrown).not.toBeInstanceOf(z.ZodError);
    expect((thrown as RowRuleError).message).toContain('quote');
    expect((thrown as RowRuleError).message).toContain('asset_id');
  });

  it('becomes a generic 500 for the client, with no column in the body', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let response: Response | undefined;
    try {
      parseRow('quote', quoteRowSchema, { ...quoteRow(), asset_id: '' });
    } catch (error) {
      response = errorToResponse(error);
    }
    expect(response?.status).toBe(500);
    const body = JSON.stringify(await response?.json());
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).not.toContain('asset_id');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('parseStoredJson: a *_json column read back', () => {
  const numbers = z.array(z.number());

  it('returns the parsed value', () => {
    expect(parseStoredJson('application.reasons_json', numbers, '[1,2]')).toEqual([1, 2]);
  });

  it('throws a RowRuleError on a stored value of another shape or on text that is not JSON', () => {
    expect(() => parseStoredJson('application.reasons_json', numbers, '["a"]')).toThrow(
      RowRuleError
    );
    expect(() => parseStoredJson('application.reasons_json', numbers, '[1,')).toThrow(RowRuleError);
  });
});
