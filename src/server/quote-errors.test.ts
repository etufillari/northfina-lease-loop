import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-response';
import { throwQuoteError } from './quote-errors';
import type { CreateQuoteFailure } from './quotes';

describe('throwQuoteError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to a generic internal error for an unknown runtime reason', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unexpected = {
      ok: false,
      reason: 'unexpected_runtime_reason',
    } as unknown as CreateQuoteFailure;

    expect(() => throwQuoteError(unexpected)).toThrow(
      new ApiError(500, 'INTERNAL_ERROR', 'Unable to process the quote')
    );
    expect(log).toHaveBeenCalledWith('Unhandled quote error reason:', 'unexpected_runtime_reason');
  });
});
