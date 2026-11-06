import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoCompanyOperator } from './demo-operator';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('demo company operator', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  it('allows same-origin operations without a selected customer', () => {
    expect(demoCompanyOperator(operatorRequest())).toEqual({
      actorId: 'demo:company-operator',
    });
  });

  it('rejects operations outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => demoCompanyOperator(operatorRequest())).toThrow(
      expect.objectContaining({ status: 404, code: 'NOT_FOUND' })
    );
  });

  it('rejects cross-origin operations', () => {
    expect(() =>
      demoCompanyOperator(
        new Request('http://localhost/api/circular', {
          method: 'POST',
          headers: { host: 'localhost', origin: 'https://other.example' },
        })
      )
    ).toThrow(expect.objectContaining({ status: 403, code: 'FORBIDDEN' }));
  });
});

function operatorRequest(): Request {
  return new Request('http://localhost/api/circular', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost' },
  });
}
