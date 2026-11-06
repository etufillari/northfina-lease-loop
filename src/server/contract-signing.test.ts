import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  contractForSigning,
  signAsSignatory,
  signingLink,
  signingToken,
  validSigningToken,
} from './contract-signing';

const origin = 'http://localhost:3000';
const settings = {
  baseURL: origin,
  secret: 'test-only-secret-never-used-in-a-real-deployment',
  production: false,
};
let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  fixture = await createTestDb();
  vi.stubEnv('NODE_ENV', 'test');
  await fixture.db.user.create({
    data: { id: 'u1', name: 'Norvi Logistics Oy', email: 'fleet@norvi.example.com' },
  });
  await fixture.db.customer.create({ data: { id: 'cust-norvi', ownerUserId: 'u1' } });
  await fixture.db.asset.create({
    data: {
      id: 'ebike-004',
      category: 'e_bike',
      make: 'Nordvolt',
      model: 'Cargo Duo',
      model_year: 2026,
      serial_number: 'LL-TEST-1',
      condition: 'new',
      usage_unit: 'km',
      usage_value: 0,
      previous_lives: 0,
      status: 'reserved',
    },
  });
  for (const [id, signatoryEmail, status] of [
    ['waiting', 'ceo@norvi.example.com', 'awaiting_signature'],
    ['ordinary', null, 'active'],
  ] as const)
    await fixture.db.contract.create({
      data: {
        id,
        customerId: 'cust-norvi',
        assetId: 'ebike-004',
        startDate: '2026-11-05',
        termMonths: 36,
        listPriceCents: 549000,
        downPaymentCents: 0,
        monthlyNetCents: 15000,
        buyoutCents: 82350,
        priceListVersion: 1,
        status,
        signatoryEmail,
      },
    });
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});
const post = (contractId: string, body: unknown, site = origin) =>
  signAsSignatory(
    fixture.db,
    new Request(`${origin}/api/contracts/${contractId}/sign`, {
      method: 'POST',
      headers: { origin: site, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    contractId,
    settings
  );

describe('signing tokens', () => {
  it('are 64 hex characters, specific to one contract and one installation', () => {
    const token = signingToken(settings.secret, 'waiting');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(validSigningToken(settings.secret, 'waiting', token)).toBe(true);
    expect(validSigningToken(settings.secret, 'ordinary', token)).toBe(false);
    expect(validSigningToken('another-installation-secret-value!', 'waiting', token)).toBe(false);
    for (const bad of [undefined, '', 'abc', token.toUpperCase(), `${token}0`])
      expect(validSigningToken(settings.secret, 'waiting', bad)).toBe(false);
  });
  it('build a link to the localized signing page', () => {
    expect(signingLink(settings, 'fi', 'waiting')).toBe(
      `${origin}/fi/sign/waiting?token=${signingToken(settings.secret, 'waiting')}`
    );
  });
});

describe('contractForSigning', () => {
  it('shows the waiting contract only with its own token', async () => {
    const token = signingToken(settings.secret, 'waiting');
    expect(await contractForSigning(fixture.db, 'waiting', token, settings)).toMatchObject({
      status: 'awaiting_signature',
      signatoryEmail: 'ceo@norvi.example.com',
      customer: { owner: { name: 'Norvi Logistics Oy' } },
    });
    expect(await contractForSigning(fixture.db, 'waiting', 'nope', settings)).toBeNull();
    const ordinaryToken = signingToken(settings.secret, 'ordinary');
    expect(await contractForSigning(fixture.db, 'ordinary', ordinaryToken, settings)).toBeNull();
  });
});

describe('signAsSignatory', () => {
  it('rejects other origins, missing confirmation and wrong tokens without changing anything', async () => {
    const token = signingToken(settings.secret, 'waiting');
    const rejectsWith = (promise: Promise<Response>, status: number) =>
      expect(promise).rejects.toMatchObject({ status });
    await rejectsWith(post('waiting', { token, confirm: true }, 'https://evil.example'), 403);
    // A missing confirmation fails validation, which handleRoute answers with 400.
    await expect(post('waiting', { token })).rejects.toMatchObject({ name: 'ZodError' });
    await rejectsWith(
      post('waiting', { token: signingToken(settings.secret, 'x'), confirm: true }),
      404
    );
    await rejectsWith(
      post('ordinary', { token: signingToken(settings.secret, 'ordinary'), confirm: true }),
      404
    );
    expect(await fixture.db.contract.findUniqueOrThrow({ where: { id: 'waiting' } })).toMatchObject(
      {
        status: 'awaiting_signature',
        signedOn: null,
      }
    );
    expect(await fixture.db.auditLog.count()).toBe(0);
  });
});
