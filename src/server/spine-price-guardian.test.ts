import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { PricePanel, type Bootstrap } from '@/components/spine/price-panel';
import { findPriceGuardianSuggestion, type PriceGuardianInput } from '@/domain/price-guardian';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, locales, type Locale } from '@/i18n/locales';
import { createTestDb } from '../../tests/helpers/test-db';
import { demoContext, resetSpine } from '../../tests/helpers/spine';
import type { PrismaClient } from './prisma-client';
import { getBootstrap } from './spine-offers';
import { createQuote, ownedQuote } from './spine-quotes';
import { quoteView } from './spine-views';

let db: PrismaClient;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(db);
});

function guardianInput(data: Bootstrap): PriceGuardianInput {
  if (!data.offer) throw new Error('The fixture must have a current offer');
  return {
    listPriceCents: data.offer.priceCents,
    downPaymentCents: 5000,
    termMonths: 36,
    table: data.coefficientTable,
    startDate: data.businessDate,
    upfrontDate: data.businessDate,
    vatRates: data.vatRates,
  };
}

function renderPrice(data: Bootstrap, locale: Locale, downText = '50', busy = false) {
  return renderToStaticMarkup(
    createElement(PricePanel, {
      data,
      locale,
      draft: { termMonths: 36, downText, startDate: data.businessDate },
      busy,
      onChange: () => undefined,
      onSave: () => undefined,
    })
  );
}

it('previews without writes, saves only on demand and never rewrites an earlier offer', async () => {
  const context = await demoContext('cust-aino', '2026-11-05');
  const assetId = 'laptop-003';
  const data = await getBootstrap(db, context, assetId);
  const startDate = '2026-11-06';
  const old = await createQuote(db, context, {
    requestId: randomUUID(),
    assetId,
    termMonths: 36,
    downPaymentCents: 5000,
    startDate,
  });
  const suggestion = findPriceGuardianSuggestion({ ...guardianInput(data), startDate });
  if (!suggestion) throw new Error('The band-trap fixture must have a suggestion');
  expect(suggestion.alternative.terms).toMatchObject({
    downPaymentCents: 0,
    monthlyNetCents: 5517,
    coefficientTableId: old.terms.coefficientTableId,
    coefficientTableVersion: old.terms.coefficientTableVersion,
  });
  renderPrice(data, 'en');
  expect(await db.quote.count()).toBe(1);
  expect(await db.auditLog.count()).toBe(1);
  expect(await db.application.count()).toBe(0);
  expect(await db.contract.count()).toBe(0);
  expect(await db.invoice.count()).toBe(0);

  const command = {
    requestId: randomUUID(),
    assetId,
    termMonths: suggestion.alternative.terms.termMonths,
    downPaymentCents: suggestion.alternative.terms.downPaymentCents,
    startDate,
  };
  const saved = await createQuote(db, context, command);
  expect(saved.terms).toEqual(suggestion.alternative.terms);
  expect(saved.priceSource).toBe(data.offer?.source);
  expect(await createQuote(db, context, command)).toEqual(saved);
  expect(quoteView(await ownedQuote(db, context, old.id))).toEqual(old);
  expect(await db.quote.count()).toBe(2);
  expect(await db.auditLog.count({ where: { action: 'quote.created' } })).toBe(2);
  expect((await db.asset.findUniqueOrThrow({ where: { id: assetId } })).status).toBe('available');

  const nextDay = { ...context, businessDate: '2026-11-06' };
  const changed = await getBootstrap(db, nextDay, assetId);
  expect(changed.offer?.priceCents).toBe(184000);
  expect(findPriceGuardianSuggestion(guardianInput(changed))).toBeNull();
  expect(quoteView(await ownedQuote(db, nextDay, old.id))).toEqual(old);
  expect(quoteView(await ownedQuote(db, nextDay, saved.id))).toEqual(saved);
  expect(await db.contract.count()).toBe(0);
  expect(await db.invoice.count()).toBe(0);
});

it.each(locales)(
  'renders the real savings, higher buyout and draft-only action in %s',
  async (locale) => {
    const data = await getBootstrap(db, await demoContext(), 'laptop-003');
    const html = renderPrice(data, locale).replaceAll('&#x27;', "'");
    const t = getT(locale);
    const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
    expect(html).toContain(t('guardian.title'));
    expect(html).toContain(
      t('guardian.summary', { useSaving: money(9225), ownSaving: money(8280) })
    );
    expect(html).toContain(t('guardian.buyoutWarning', { amount: money(945) }));
    expect(html).toContain(t('guardian.actionHelp'));
    expect(html).toContain(t('guardian.choose', { amount: money(0) }));
    expect(html).toContain(money(259407));
    expect(html).toContain(money(250182));
    expect(html).not.toMatch(/\{\w+\}|guardian\.[A-Za-z]+/);
    expect(await db.quote.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  }
);

it('removes invalid and unavailable suggestions and disables choosing during a pending save', async () => {
  const data = await getBootstrap(db, await demoContext(), 'laptop-003');
  expect(renderPrice(data, 'en', '50', true)).toMatch(/id="guardian-choose"[^>]*disabled=""/);
  expect(renderPrice(data, 'en', '-1')).not.toContain('id="price-guardian"');
  expect(renderPrice(data, 'en', '0')).not.toContain('id="price-guardian"');
  expect(
    renderPrice({ ...data, asset: { ...data.asset, status: 'reserved' } }, 'en')
  ).not.toContain('id="price-guardian"');
  expect(await db.quote.count()).toBe(0);
});
