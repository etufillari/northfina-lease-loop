import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets, loadCoefficientTable, loadVatRates } from '@/data/load';
import { checkoutQuote } from '@/domain/checkout-quote';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { handleAuthMutation } from './auth-handler';
import { readIdentity } from './auth-session';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
vi.mock('@/server/db', () => ({
  get db() {
    return fixture.db;
  },
}));
vi.mock('@/server/today', () => ({ todayIso: () => '2026-11-05' }));
import { POST } from '@/app/api/checkout/route';
import { POST as APPLY } from '@/app/api/applications/route';
import { POST as SIGN } from '@/app/api/contracts/[id]/sign/route';
import { signingToken } from './contract-signing';

const origin = 'http://localhost:3000';
const settings = {
  baseURL: origin,
  secret: 'test-only-secret-never-used-in-a-real-deployment',
  production: false,
};
const token = 'b4ef9210-1e71-4865-a6b7-46382a47aad4';
const body = {
  token,
  applicationId: 'not-approved',
  date: '2026-11-05',
  items: [
    {
      id: 'ebike-003',
      priceCents: 389000,
      monthlyTotalCents: 13466,
      version: 1,
      termMonths: 36,
      downPaymentCents: 0,
    },
  ],
  delivery: 'delivery',
  address: 'Test address 1',
  payment: 'card',
};
function request(cookie: string, value: object = body, site = origin) {
  return new Request(`${origin}/api/checkout`, {
    method: 'POST',
    headers: { origin: site, cookie, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
}
beforeEach(async () => {
  fixture = await createTestDb();
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', settings.secret);
  vi.stubEnv('NODE_ENV', 'test');
  const asset = (await loadAssets()).find((item) => item.id === 'ebike-003');
  if (!asset) throw new Error('Missing asset');
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'asset', entityId: asset.id },
    (tx) => tx.asset.create({ data: toAssetRowData(asset) })
  );
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});
async function customer() {
  const response = await handleAuthMutation(
    fixture.db,
    new Request(`${origin}/api/auth/register`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Customer',
        email: 'checkout@example.com',
        password: 'automated-test-passphrase-only',
      }),
    }),
    'register',
    settings
  );
  const cookie = response.headers
    .getSetCookie()
    .map((item) => item.split(';')[0])
    .join('; ');
  const identity = await readIdentity(fixture.db, new Headers({ cookie }), settings);
  if (!identity) throw new Error('Missing session');
  return { cookie, identity };
}
describe('simulated checkout', () => {
  it('requires authentication, validates quotes, and rejects cross-origin writes', async () => {
    expect((await POST(request(''), undefined)).status).toBe(401);
    const { cookie } = await customer();
    expect((await POST(request(cookie, body, 'https://invalid.example'), undefined)).status).toBe(
      403
    );
    expect(
      (
        await POST(
          request(cookie, { ...body, items: [{ ...body.items[0]!, priceCents: 1 }] }),
          undefined
        )
      ).status
    ).toBe(409);
    expect((await POST(request(cookie), undefined)).status).toBe(403);
    expect(await fixture.db.contract.count()).toBe(0);
  });
  it('creates an audited simulated lease once, without claiming payment', async () => {
    const { cookie, identity } = await customer();
    const application = await APPLY(
      new Request(`${origin}/api/applications`, {
        method: 'POST',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: 'ebike-003', termMonths: 36, downPaymentCents: 0 }],
          answers: {
            q_customer_type: 'consumer',
            q_full_name: 'Customer',
            q_birth_date: '1990-01-01',
            q_email: 'checkout@example.com',
            q_country: 'FI',
            q_employment: 'employed',
            q_monthly_income: 250000,
            q_usage_purpose: 'commuting',
          },
        }),
      }),
      undefined
    );
    expect(application.status).toBe(201);
    const { data } = await application.json();
    const approved = { ...body, applicationId: data.id };
    expect((await POST(request(cookie, approved), undefined)).status).toBe(201);
    expect((await POST(request(cookie, approved), undefined)).status).toBe(201);
    const contracts = await fixture.db.contract.findMany({ include: { invoices: true } });
    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({
      customerId: identity.customerId,
      assetId: 'ebike-003',
      isDemo: true,
      monthlyNetCents: 10730,
      downPaymentCents: 0,
    });
    expect(contracts[0]?.invoices).toHaveLength(0);
    expect(
      await fixture.db.auditLog.count({ where: { action: 'lease.simulated_checkout' } })
    ).toBeGreaterThan(0);
  });
  it('card 6: a company applicant who cannot sign gets a contract that waits for the signatory', async () => {
    const { cookie } = await customer();
    const application = await APPLY(
      new Request(`${origin}/api/applications`, {
        method: 'POST',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: 'ebike-003', termMonths: 36, downPaymentCents: 0 }],
          answers: {
            q_customer_type: 'company',
            q_company_name: 'Norvi Logistics Oy',
            q_email: 'fleet@norvi.example.com',
            q_business_id: '3299871-7',
            q_can_sign: 'no',
            q_signatory_email: 'CEO@norvi.example.com',
            q_vat_registered: 'yes',
            q_usage_purpose: 'delivery',
          },
        }),
      }),
      undefined
    );
    const { data } = await application.json();
    expect(data.status).toBe('approved');
    const stored = await fixture.db.leaseApplication.findUniqueOrThrow({ where: { id: data.id } });
    expect(JSON.parse(stored.reasonsJson)).toEqual(['signatory_pending']);

    expect(
      (await POST(request(cookie, { ...body, applicationId: data.id }), undefined)).status
    ).toBe(201);
    const [waiting] = await fixture.db.contract.findMany({
      include: { events: true, asset: true },
    });
    expect(waiting).toMatchObject({
      status: 'awaiting_signature',
      signatoryEmail: 'ceo@norvi.example.com',
      signedOn: null,
      monthlyNetCents: 10730,
    });
    expect(waiting!.events).toEqual([]);
    expect(waiting!.asset.status).toBe('reserved');
    const checkoutAudit = await fixture.db.auditLog.findFirst({
      where: { action: 'lease.simulated_checkout' },
    });
    expect(JSON.parse(checkoutAudit!.details_json!)).toMatchObject({
      awaitingSignatureFrom: 'ceo@norvi.example.com',
    });

    // The signatory opens the e-mailed link a fortnight later and signs; billing starts then.
    const sign = (value: unknown, demoDate = '2026-11-19') =>
      SIGN(
        new Request(`${origin}/api/contracts/${waiting!.id}/sign`, {
          method: 'POST',
          headers: {
            origin,
            'content-type': 'application/json',
            cookie: `lease-loop.demo-date=${demoDate}`,
          },
          body: JSON.stringify(value),
        }),
        { params: Promise.resolve({ id: waiting!.id }) }
      );
    const valid = signingToken(settings.secret, waiting!.id);
    expect((await sign({ token: valid, confirm: true })).status).toBe(200);
    const signed = await fixture.db.contract.findUniqueOrThrow({
      where: { id: waiting!.id },
      include: { events: true },
    });
    expect(signed).toMatchObject({
      status: 'active',
      startDate: '2026-11-19',
      signedOn: '2026-11-19',
      monthlyNetCents: 10730,
    });
    expect(signed.events.map((event) => [event.kind, event.eventDate])).toEqual([
      ['signed', '2026-11-19'],
    ]);
    const audit = await fixture.db.auditLog.findFirst({
      where: { action: 'contract.signed_by_signatory' },
    });
    expect(audit).toMatchObject({ actor: 'signatory:ceo@norvi.example.com' });
    expect((await sign({ token: valid, confirm: true })).status).toBe(409);
  });
  it('card 2: quoted on Thursday (v1), signed on Friday (v2) only after accepting the new price', async () => {
    const laptop = (await loadAssets()).find((item) => item.id === 'laptop-004')!;
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.setup', entityType: 'asset', entityId: laptop.id },
      (tx) => tx.asset.create({ data: toAssetRowData(laptop) })
    );
    const { cookie } = await customer();
    const on = (date: string) => `${cookie}; lease-loop.demo-date=${date}`;
    const selection = [{ id: 'laptop-004', termMonths: 36, downPaymentCents: 0 }];
    const applied = await APPLY(
      new Request(`${origin}/api/applications`, {
        method: 'POST',
        headers: { origin, cookie: on('2026-11-05'), 'content-type': 'application/json' },
        body: JSON.stringify({
          items: selection,
          answers: {
            q_customer_type: 'consumer',
            q_full_name: 'Customer',
            q_birth_date: '1990-01-01',
            q_email: 'checkout@example.com',
            q_country: 'FI',
            q_employment: 'employed',
            q_monthly_income: 400000,
          },
        }),
      }),
      undefined
    );
    const { data } = await applied.json();
    expect(data.status).toBe('approved');
    const [table, vat] = await Promise.all([loadCoefficientTable(), loadVatRates()]);
    const friday = checkoutQuote(321100, 0, 36, '2026-11-06', table, vat.rates)!;
    const signFriday = (extra: object = {}, date = '2026-11-06') =>
      POST(
        request(on(date), {
          ...body,
          token: crypto.randomUUID(),
          applicationId: data.id,
          date,
          items: [
            {
              id: 'laptop-004',
              priceCents: 321100,
              monthlyTotalCents: friday.monthlyTotalCents,
              version: 2,
              termMonths: 36,
              downPaymentCents: 0,
            },
          ],
          ...extra,
        }),
        undefined
      );

    const refused = await signFriday();
    expect(refused.status).toBe(409);
    const { error } = await refused.json();
    expect(error.code).toBe('PRICE_CHANGED');
    expect(error.details.changes).toEqual([
      expect.objectContaining({
        id: 'laptop-004',
        quotedPriceCents: 349000,
        quotedPriceListVersion: 1,
        priceCents: 321100,
        priceListVersion: 2,
        differenceCents: -27900,
      }),
    ]);
    expect(await fixture.db.contract.count()).toBe(0);

    expect((await signFriday({ acceptPriceChange: true })).status).toBe(201);
    const contract = await fixture.db.contract.findFirstOrThrow({
      where: { assetId: 'laptop-004' },
    });
    expect(contract).toMatchObject({
      startDate: '2026-11-06',
      listPriceCents: 321100,
      priceListVersion: 2,
      monthlyNetCents: friday.monthlyNetCents,
      quotedOn: '2026-11-05',
      quotedPriceCents: 349000,
      quotedPriceListVersion: 1,
    });
    const audit = await fixture.db.auditLog.findFirst({
      where: { action: 'lease.simulated_checkout', details_json: { contains: 'priceChanges' } },
    });
    expect(audit).not.toBeNull();
  });
  it('refuses an approval older than the quote validity window', async () => {
    const { cookie } = await customer();
    const applied = await APPLY(
      new Request(`${origin}/api/applications`, {
        method: 'POST',
        headers: {
          origin,
          cookie: `${cookie}; lease-loop.demo-date=2026-11-05`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ id: 'ebike-003', termMonths: 36, downPaymentCents: 0 }],
          answers: {
            q_customer_type: 'consumer',
            q_full_name: 'Customer',
            q_birth_date: '1990-01-01',
            q_email: 'checkout@example.com',
            q_country: 'FI',
            q_employment: 'employed',
            q_monthly_income: 400000,
            q_usage_purpose: 'commuting',
          },
        }),
      }),
      undefined
    );
    const { data } = await applied.json();
    const [table, vat] = await Promise.all([loadCoefficientTable(), loadVatRates()]);
    const later = checkoutQuote(408400, 0, 36, '2026-11-13', table, vat.rates)!;
    const response = await POST(
      request(`${cookie}; lease-loop.demo-date=2026-11-13`, {
        ...body,
        applicationId: data.id,
        date: '2026-11-13',
        items: [
          {
            ...body.items[0]!,
            priceCents: 408400,
            version: 2,
            monthlyTotalCents: later.monthlyTotalCents,
          },
        ],
        acceptPriceChange: true,
      }),
      undefined
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('APPLICATION_CHANGED');
  });
});
