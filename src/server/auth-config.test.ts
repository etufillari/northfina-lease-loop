import { afterEach, describe, expect, it, vi } from 'vitest';
import { authSettings } from './auth-config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('authentication deployment settings', () => {
  it('rejects a missing or short secret', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    expect(authSettings).toThrow('auth:setup');
  });

  it('rejects URL paths, trailing slashes and non-HTTP schemes', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-only-secret-never-used-in-a-real-deployment');
    for (const url of [
      'http://localhost:3000/',
      'http://localhost:3000/path',
      'file:///tmp/test',
    ]) {
      vi.stubEnv('BETTER_AUTH_URL', url);
      expect(authSettings).toThrow();
    }
  });

  it('requires HTTPS in production and accepts an explicit secure origin', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-only-secret-never-used-in-a-real-deployment');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_URL', 'http://example.com');
    expect(authSettings).toThrow('HTTPS');
    vi.stubEnv('BETTER_AUTH_URL', 'https://example.com');
    expect(authSettings()).toMatchObject({ baseURL: 'https://example.com', production: true });
  });
});
