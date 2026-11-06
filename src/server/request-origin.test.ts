import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireSameOrigin } from './request-origin';
afterEach(() => vi.unstubAllEnvs());
describe('demo tunnel origin', () => {
  it('accepts localhost without trusting proxy headers', () => {
    expect(() =>
      requireSameOrigin(
        new Request('http://localhost:3000/api/test', {
          headers: { origin: 'http://localhost:3000' },
        })
      )
    ).not.toThrow();
  });
  it('accepts HTTPS only for the exact configured development host', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LEASE_LOOP_DEMO_HOST', 'demo.trycloudflare.com');
    expect(() =>
      requireSameOrigin(
        new Request('http://localhost:3012/api/test', {
          headers: { host: 'demo.trycloudflare.com', origin: 'https://demo.trycloudflare.com' },
        })
      )
    ).not.toThrow();
  });
  it('rejects another origin and an unconfigured HTTPS host', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LEASE_LOOP_DEMO_HOST', 'demo.trycloudflare.com');
    for (const [host, origin] of [
      ['demo.trycloudflare.com', 'https://attacker.example'],
      ['other.example', 'https://other.example'],
    ])
      expect(() =>
        requireSameOrigin(
          new Request('http://localhost/api/test', { headers: { host: host!, origin: origin! } })
        )
      ).toThrow(expect.objectContaining({ status: 403 }));
  });
});
