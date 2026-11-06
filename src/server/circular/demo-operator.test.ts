import { createOperatorSession, validOperatorSession } from './operator-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoCompanyOperator } from './demo-operator';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('demo company operator', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LEASE_LOOP_OPERATOR_PASSWORD', 'test-operator-password');
  });

  it('allows a signed-in company operator without a selected customer', () => {
    expect(demoCompanyOperator(operatorRequest())).toEqual({
      actorId: 'demo:company-operator',
    });
  });

  it('rejects a customer cookie without an operator session', () => {
    expect(() =>
      demoCompanyOperator(
        new Request('http://localhost/api/circular', {
          headers: {
            host: 'localhost',
            origin: 'http://localhost',
            cookie: 'lease-loop-active-user=cust-aino',
          },
        })
      )
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
  it('rejects incorrect passwords, forged and expired sessions', () => {
    expect(() => createOperatorSession('wrong')).toThrow(expect.objectContaining({ status: 403 }));
    expect(validOperatorSession('9999999999.forged')).toBe(false);
    const session = createOperatorSession('test-operator-password');
    expect(validOperatorSession(session)).toBe(true);
    vi.useFakeTimers();
    vi.advanceTimersByTime(5 * 60 * 60 * 1000);
    expect(validOperatorSession(session)).toBe(false);
    vi.useRealTimers();
  });
  it('requires company mode even with a valid operator session', () => {
    const request = operatorRequest();
    request.headers.set(
      'cookie',
      `lease-loop-operator=${createOperatorSession('test-operator-password')}`
    );
    expect(() => demoCompanyOperator(request)).toThrow(expect.objectContaining({ status: 403 }));
  });
  it('allows signed-in company notification reads without a mutation origin header', () => {
    const headers = operatorRequest().headers;
    headers.delete('origin');
    expect(
      demoCompanyOperator(new Request('http://localhost/api/operator/notifications', { headers }))
    ).toEqual({ actorId: 'demo:company-operator' });
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
    headers: {
      host: 'localhost',
      origin: 'http://localhost',
      cookie:
        process.env.NODE_ENV === 'development'
          ? `lease-loop-company-mode=1; lease-loop-operator=${createOperatorSession('test-operator-password')}`
          : '',
    },
  });
}
