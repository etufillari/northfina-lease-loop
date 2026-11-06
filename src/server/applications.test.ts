import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets } from '@/data/load';
import { applicationCart } from '@/domain/application-cart';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { handleAuthMutation } from './auth-handler';
import { readIdentity } from './auth-session';
import { findCustomerApplication } from './applications';
import { checkoutOptions } from './checkout-options';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
vi.mock('@/server/db', () => ({
  get db() {
    return fixture.db;
  },
}));
vi.mock('@/server/today', () => ({ todayIso: () => '2026-11-05' }));
import { POST as APPLY } from '@/app/api/applications/route';
import { POST as CHECKOUT } from '@/app/api/checkout/route';

const origin = 'http://localhost:3000';
const settings = {
  baseURL: origin,
  secret: 'test-only-secret-never-used-in-a-real-deployment',
  production: false,
};
const selection = [{ id: 'ebike-003', termMonths: 36, downPaymentCents: 0 }];
const answers = {
  q_customer_type: 'consumer',
  q_full_name: 'Applicant',
  q_birth_date: '1990-01-01',
  q_email: 'applicant@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 250000,
  q_usage_purpose: 'commuting',
};
function request(cookie: string, body: unknown, route = 'applications', site = origin) {
  return new Request(`${origin}/api/${route}`, {
    method: 'POST',
    headers: { origin: site, cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function customer(email = 'applicant@example.com') {
  const response = await handleAuthMutation(
    fixture.db,
    request(
      '',
      { name: 'Applicant', email, password: 'test-only-long-passphrase' },
      'auth/register'
    ),
    'register',
    settings
  );
  const cookie = response.headers
    .getSetCookie()
    .map((part) => part.split(';')[0])
    .join('; ');
  const identity = await readIdentity(fixture.db, new Headers({ cookie }), settings);
  if (!identity) throw new Error('Missing identity');
  return { cookie, identity };
}
async function checkout(cookie: string, applicationId: string, termMonths = 36) {
  const selections = [{ ...selection[0]!, termMonths }];
  const data = await checkoutOptions('2026-11-05');
  const cart = applicationCart(data, selections)!;
  return CHECKOUT(
    request(
      cookie,
      {
        token: 'b4ef9210-1e71-4865-a6b7-46382a47aad4',
        applicationId,
        date: data.today,
        items: cart.items.map((item) => ({
          id: item.id,
          termMonths: item.termMonths,
          downPaymentCents: item.downPaymentCents,
          priceCents: item.priceCents,
          monthlyTotalCents: item.monthlyTotalCents,
          version: item.priceListVersion,
        })),
        delivery: 'delivery',
        address: 'Test address',
        payment: 'invoice',
      },
      'checkout'
    ),
    undefined
  );
}
beforeEach(async () => {
  fixture = await createTestDb();
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', settings.secret);
  vi.stubEnv('NODE_ENV', 'test');
  const assets = await loadAssets();
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'asset', entityId: 'fixture' },
    (tx) => tx.asset.createMany({ data: assets.map(toAssetRowData) })
  );
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});

describe('application API and checkout approval boundary', () => {
  it('requires authentication, same origin, bounded JSON and server-owned identity', async () => {
    expect((await APPLY(request('', { items: selection, answers }), undefined)).status).toBe(401);
    const { cookie } = await customer();
    expect(
      (
        await APPLY(
          request(cookie, { items: selection, answers }, 'applications', 'https://evil.example'),
          undefined
        )
      ).status
    ).toBe(403);
    expect(
      (
        await APPLY(
          request(cookie, { items: selection, answers, customerId: 'forged', status: 'approved' }),
          undefined
        )
      ).status
    ).toBe(400);
    const oversized = new Request(`${origin}/api/applications`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: 'x'.repeat(32769),
    });
    expect((await APPLY(oversized, undefined)).status).toBe(413);
    const invalid = new Request(`${origin}/api/applications`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: '{',
    });
    expect((await APPLY(invalid, undefined)).status).toBe(400);
    expect(
      (await APPLY(request(cookie, { items: selection, answers: {} }), undefined)).status
    ).toBe(422);
    expect(await fixture.db.leaseApplication.count()).toBe(0);
  });
  it('saves an audited result, prunes hidden answers, and restricts it to its owner', async () => {
    const { cookie, identity } = await customer();
    const result = await APPLY(
      request(cookie, {
        items: selection,
        answers: { ...answers, q_pep_details: 'Must not persist' },
      }),
      undefined
    );
    expect(result.status).toBe(201);
    const { data } = await result.json();
    expect(data.status).toBe('approved');
    const saved = await findCustomerApplication(fixture.db, identity.customerId, data.id);
    expect(JSON.parse(saved!.answersJson).q_pep_details).toBeUndefined();
    expect(saved!.customerId).toBe(identity.customerId);
    const other = await customer('other@example.com');
    expect(
      await findCustomerApplication(fixture.db, other.identity.customerId, data.id)
    ).toBeNull();
    expect((await checkout(other.cookie, data.id)).status).toBe(403);
    const audit = await fixture.db.auditLog.findFirstOrThrow({
      where: { action: 'application.submitted' },
    });
    expect(audit.details_json).not.toContain('applicant@example.com');
    expect(audit.details_json).not.toContain('1990-01-01');
    expect((await checkout(cookie, data.id, 24)).status).toBe(409);
    expect((await checkout(cookie, data.id)).status).toBe(201);
  });
  it('persists a rejected outcome and cannot bypass it at checkout', async () => {
    const { cookie } = await customer();
    const result = await APPLY(
      request(cookie, { items: selection, answers: { ...answers, q_birth_date: '2009-11-06' } }),
      undefined
    );
    expect(result.status).toBe(201);
    const { data } = await result.json();
    expect(data.status).toBe('rejected');
    expect((await checkout(cookie, data.id)).status).toBe(403);
    expect(await fixture.db.contract.count()).toBe(0);
  });
  it('approves a company applicant who cannot sign, pending the named signatory', async () => {
    const { cookie } = await customer();
    const result = await APPLY(
      request(cookie, {
        items: selection,
        answers: {
          q_customer_type: 'company',
          q_company_name: 'Company',
          q_business_id: '1234567-1',
          q_email: 'company@example.com',
          q_can_sign: 'no',
          q_signatory_email: 'signer@example.com',
          q_vat_registered: 'yes',
          q_usage_purpose: 'delivery',
        },
      }),
      undefined
    );
    const { data } = await result.json();
    expect(data.status).toBe('approved');
    const stored = await fixture.db.leaseApplication.findUniqueOrThrow({ where: { id: data.id } });
    expect(JSON.parse(stored.reasonsJson)).toEqual(['signatory_pending']);
  });
  it('rejects unavailable assets and expired approvals', async () => {
    const { cookie } = await customer();
    const result = await APPLY(request(cookie, { items: selection, answers }), undefined);
    const { data } = await result.json();
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.expire', entityType: 'application', entityId: data.id },
      (tx) =>
        tx.leaseApplication.update({ where: { id: data.id }, data: { startDate: '2026-10-28' } })
    );
    expect((await checkout(cookie, data.id)).status).toBe(409);
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.reserve', entityType: 'asset', entityId: 'ebike-003' },
      (tx) => tx.asset.update({ where: { id: 'ebike-003' }, data: { status: 'reserved' } })
    );
    expect((await APPLY(request(cookie, { items: selection, answers }), undefined)).status).toBe(
      409
    );
  });
  it('rolls back a saved application if auditing fails and returns a generic error', async () => {
    const { cookie } = await customer();
    await fixture.db.$executeRawUnsafe('DROP TABLE AuditLog');
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await APPLY(request(cookie, { items: selection, answers }), undefined);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.message).toBe('Something went wrong');
      expect(await fixture.db.leaseApplication.count()).toBe(0);
    } finally {
      logger.mockRestore();
    }
  });
});
