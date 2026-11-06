import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { demoContext, resetSpine } from '../../tests/helpers/spine';
import { SavedPriceExplanation } from '@/components/spine/saved-price-explanation';
import { PricePanel } from '@/components/spine/price-panel';
import { comparePriceOptions } from '@/domain/price-comparison';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale } from '@/i18n/locales';
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

it('saves only the chosen comparison and explains its persisted price after the list changes', async () => {
  await resetSpine(db);
  const context = await demoContext();
  const assetId = 'laptop-004';
  const startDate = '2026-11-06';
  const data = await getBootstrap(db, context, assetId);
  if (!data.offer) throw new Error('The fixture must have an offer');
  const input = {
    listPriceCents: data.offer.priceCents,
    downPaymentCents: 50000,
    termMonths: [24, 36],
    table: data.coefficientTable,
    startDate,
    upfrontDate: data.businessDate,
    vatRates: data.vatRates,
  };
  const chosen = comparePriceOptions(input).find((option) => option.termMonths === 24);
  if (!chosen?.ok) throw new Error('The selected option must be financeable');
  expect(chosen.explanation).toMatchObject({
    terms: { listPriceCents: 349000, financedCents: 299000, monthlyNetCents: 10624 },
    firstRent: { grossCents: 13333 },
    useGrossCents: 383908,
    ownGrossCents: 478093,
  });
  expect(await db.quote.count()).toBe(0);
  expect(await db.auditLog.count()).toBe(0);

  const requestId = randomUUID();
  const quote = await createQuote(db, context, {
    requestId,
    assetId,
    termMonths: chosen.termMonths,
    downPaymentCents: input.downPaymentCents,
    startDate,
  });
  expect(quote).toEqual({
    id: requestId,
    customerId: context.customer.id,
    assetId,
    pricedOn: '2026-11-05',
    startDate,
    validThrough: '2026-11-06',
    priceSource: 'list:1',
    terms: chosen.explanation.terms,
  });

  const nextDay = { ...context, businessDate: '2026-11-06' };
  const current = await getBootstrap(db, nextDay, assetId);
  expect(current.offer).toMatchObject({ priceCents: 321100, source: 'list:2' });
  if (!current.offer) throw new Error('The next day must have an offer');
  expect(
    comparePriceOptions({
      ...input,
      listPriceCents: current.offer.priceCents,
      upfrontDate: current.businessDate,
    })
  ).toMatchObject([
    { termMonths: 24, ok: true, explanation: { terms: { monthlyNetCents: 9633 } } },
    { termMonths: 36, ok: true },
  ]);

  const saved = quoteView(await ownedQuote(db, nextDay, quote.id));
  expect(saved).toEqual(quote);
  const markup = renderToStaticMarkup(
    createElement(SavedPriceExplanation, {
      quote: saved,
      data: current,
      locale: 'en',
    })
  );
  expect(markup).toContain('Price list 1 · Price on 5 November 2026');
  for (const amount of ['€3,490.00', '€133.33', '€3,839.08', '€4,780.93']) {
    expect(markup).toContain(amount);
  }
  expect(markup).not.toContain('Price list 2');
  expect(markup).not.toContain('€3,211.00');
  expect(await db.quote.count()).toBe(1);
  expect(await db.auditLog.count()).toBe(1);
  expect(await db.auditLog.findFirst()).toMatchObject({
    action: 'quote.created',
    entity_type: 'quote',
    entity_id: requestId,
  });
  expect(await db.contract.count()).toBe(0);
  expect((await db.asset.findUniqueOrThrow({ where: { id: assetId } })).status).toBe('available');
});

it.each(['en', 'fi', 'sv', 'et'] as const)(
  'renders the actual band warning and comparison without untranslated placeholders in %s',
  async (locale) => {
    await resetSpine(db);
    const data = await getBootstrap(db, await demoContext(), 'laptop-003');
    const markup = renderToStaticMarkup(
      createElement(PricePanel, {
        data,
        locale,
        draft: { termMonths: 36, downText: '0.01', startDate: '2026-11-05' },
        busy: false,
        onChange: () => undefined,
        onSave: () => undefined,
      })
    );
    const t = getT(locale);
    expect(markup).toContain(t('explain.compareTitle'));
    expect(markup).toContain(
      t('explain.bandHigher', {
        amount: formatEuro(208, intlLocale[locale]),
      })
    );
    expect(markup).not.toMatch(/\{\w+\}|explain\.[A-Za-z]+/);
    expect(await db.quote.count()).toBe(0);
  }
);
