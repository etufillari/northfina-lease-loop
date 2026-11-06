import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from './audit';

export type AuthSettings = { baseURL: string; secret: string; production: boolean };

export function authSettings(): AuthSettings {
  const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  const production = process.env.NODE_ENV === 'production';
  const url = new URL(baseURL);
  if (url.origin !== baseURL || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('BETTER_AUTH_URL must be an exact HTTP(S) origin without a trailing slash.');
  }
  if (production && url.protocol !== 'https:') {
    throw new Error('Production authentication requires HTTPS.');
  }
  if (secret.length < 32) throw new Error('Run npm run auth:setup to create a local auth secret.');
  return { baseURL, secret, production };
}

/** Mutating handlers receive only withAudit's transaction, never the global client. */
export function createAuth(database: PrismaClient | TransactionClient, settings = authSettings()) {
  return betterAuth({
    appName: 'Lease Loop',
    baseURL: settings.baseURL,
    basePath: '/api/auth',
    secret: settings.secret,
    trustedOrigins: [settings.baseURL],
    database: prismaAdapter(database, { provider: 'sqlite', transaction: false }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 15,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      additionalFields: { role: { type: 'string', defaultValue: 'customer', input: false } },
    },
    account: { modelName: 'AuthIdentity', accountLinking: { enabled: false } },
    verification: { modelName: 'AuthVerification' },
    session: {
      modelName: 'AuthSession',
      expiresIn: 60 * 60 * 24,
      freshAge: 60 * 15,
      disableSessionRefresh: true,
      // Expired-session cleanup is also a write: never do it during a server-page read.
      deferSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'AuthRateLimit',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: settings.production,
      cookiePrefix: 'lease-loop',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      // No trusted proxy is configured. Use the library's shared per-path bucket
      // rather than allowing callers to bypass limits by forging forwarded headers.
      ipAddress: { ipAddressHeaders: [] },
    },
    logger: { disabled: true },
  });
}
