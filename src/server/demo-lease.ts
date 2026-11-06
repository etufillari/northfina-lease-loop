import type { PrismaClient } from '@/generated/prisma/client';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { monthlyFactorFor } from '@/domain/coefficient';
import { forecastInvoices, quoteAmounts } from '@/domain/lease-billing';
import { listPriceOn } from '@/domain/price-list';
import { ApiError } from './api-response';
import { withAudit } from './audit';

/** Opt-in demo only. No physical asset status is changed or real payment claimed. */
export async function createDemoLease(
  db: PrismaClient,
  input: { customerId: string; userId: string; today: string }
) {
  const assetId = 'ebike-005';
  const startDate = '2026-11-05';
  const termMonths = 36;
  const [prices, table, vat] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const price = listPriceOn(prices, assetId, startDate);
  if (!price.ok) throw new ApiError(503, 'DEMO_UNAVAILABLE', 'Demo data is unavailable.');
  const factor = monthlyFactorFor(table, price.priceCents, termMonths);
  const buyout = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (!factor.ok || buyout === undefined)
    throw new ApiError(503, 'DEMO_UNAVAILABLE', 'Demo data is unavailable.');
  const quote = quoteAmounts(price.priceCents, factor.factor, buyout);
  const schedule = forecastInvoices(startDate, termMonths, quote.monthlyNetCents, vat.rates);
  if (!schedule.ok) throw new ApiError(503, 'DEMO_UNAVAILABLE', 'Demo data is unavailable.');
  const first = schedule.invoices[0];
  if (!first) throw new ApiError(503, 'DEMO_UNAVAILABLE', 'Demo data is unavailable.');
  return withAudit(
    db,
    {
      actor: input.userId,
      action: 'lease.demo_created',
      entityType: 'customer',
      entityId: input.customerId,
    },
    async (tx) => {
      if (await tx.contract.findFirst({ where: { customerId: input.customerId, isDemo: true } }))
        throw new ApiError(409, 'DEMO_EXISTS', 'A demo lease already exists.');
      if (!(await tx.asset.findUnique({ where: { id: assetId }, select: { id: true } })))
        throw new ApiError(503, 'DEMO_UNAVAILABLE', 'Run the database setup first.');
      const contract = await tx.contract.create({
        data: {
          customerId: input.customerId,
          assetId,
          startDate,
          termMonths,
          listPriceCents: price.priceCents,
          downPaymentCents: 0,
          ...quote,
          priceListVersion: price.priceListVersion,
          isDemo: true,
          events: { create: { kind: 'signed', eventDate: startDate } },
        },
      });
      if (first.dueDate <= input.today) {
        const invoice = await tx.invoice.create({
          data: {
            contractId: contract.id,
            dueDate: first.dueDate,
            issuedDate: first.dueDate,
            netCents: first.netCents,
            vatBasisPoints: first.vatBasisPoints,
            vatCents: first.vatCents,
          },
        });
        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amountCents: first.totalCents,
            paidDate: first.dueDate,
            isSimulated: true,
          },
        });
        await tx.leaseEvent.create({
          data: { contractId: contract.id, kind: 'payment', eventDate: first.dueDate },
        });
      }
      return contract.id;
    }
  );
}
