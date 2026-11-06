import { z } from 'zod';
import type { Application, Contract, Invoice, Quote } from '@/generated/prisma/client';
import { loadVatRates } from '@/data/load';
import { invoiceSchedule } from '@/domain/invoicing';
import { ApiError } from './api-response';
import { requireCustomer, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { answersSchema, priceTermsSchema } from './spine-shapes';

export function quoteView(row: Quote) {
  return {
    id: row.id,
    customerId: row.customer_id,
    assetId: row.asset_id,
    pricedOn: row.priced_on,
    startDate: row.start_date,
    validThrough: row.valid_through,
    priceSource: row.price_source,
    terms: priceTermsSchema.parse(JSON.parse(row.terms_json)),
  };
}
export type QuoteView = ReturnType<typeof quoteView>;

const reasonsSchema = z.strictObject({
  reasons: z.array(z.string()),
  missingQuestionIds: z.array(z.string()),
  invalidQuestionIds: z.array(z.string()),
});
const decisionSchema = z.enum(['approved', 'declined', 'manual_review', 'incomplete']);

export function applicationView(row: Application) {
  return {
    id: row.id,
    quoteId: row.quote_id,
    decision: decisionSchema.parse(row.decision),
    ...reasonsSchema.parse(JSON.parse(row.reasons_json)),
    answers: answersSchema.parse(JSON.parse(row.answers_json)),
  };
}
export type ApplicationView = ReturnType<typeof applicationView>;

export function invoiceView(row: Invoice) {
  return {
    id: row.id,
    kind: row.kind,
    period: row.period,
    scheduledFor: row.scheduled_for,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    netCents: row.net_cents,
    vatBasisPoints: row.vat_basis_points,
    vatCents: row.vat_cents,
    grossCents: row.gross_cents,
  };
}

export async function ownedContract(db: PrismaClient, context: DemoContext, id: string) {
  requireCustomer(context);
  const contract = await db.contract.findFirst({
    where: { id, customer_id: context.customer.id },
    include: { quote: { select: { price_source: true, priced_on: true, valid_through: true } } },
  });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND', 'The contract was not found');
  return contract;
}

export async function getContract(db: PrismaClient, context: DemoContext, id: string) {
  const contract = await ownedContract(db, context, id);
  const terms = priceTermsSchema.parse(JSON.parse(contract.terms_json));
  const [invoices, vatRates] = await Promise.all([
    db.invoice.findMany({
      where: { contract_id: id },
      orderBy: [{ invoice_date: 'asc' }, { kind: 'asc' }, { period: 'asc' }],
    }),
    loadVatRates(),
  ]);
  const schedule = invoiceSchedule(
    {
      startDate: contract.start_date,
      termMonths: terms.termMonths,
      monthlyNetCents: terms.monthlyNetCents,
    },
    vatRates
  );
  const issuedPeriods = new Set(
    invoices.filter((invoice) => invoice.kind === 'rent').map((invoice) => invoice.period)
  );
  const forecast = schedule.ok ? schedule.invoices : [];
  const next = forecast.find((invoice) => !issuedPeriods.has(invoice.period));
  return {
    id: contract.id,
    assetId: contract.asset_id,
    lifeNumber: contract.life_number,
    signedOn: contract.signed_on,
    startDate: contract.start_date,
    endDate: contract.end_date,
    status: contract.status,
    closedOn: contract.closed_on,
    nextCustomerId: contract.next_customer_id,
    priceSource: contract.quote.price_source,
    pricedOn: contract.quote.priced_on,
    validThrough: contract.quote.valid_through,
    terms,
    invoices: invoices.map(invoiceView),
    forecast,
    forecastAvailable: schedule.ok,
    nextScheduledDate: next?.invoiceDate ?? null,
  };
}
export type ContractView = Awaited<ReturnType<typeof getContract>>;

export async function listContracts(db: PrismaClient, context: DemoContext) {
  requireCustomer(context);
  return db.contract.findMany({
    where: { customer_id: context.customer.id },
    orderBy: [{ signed_on: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      asset_id: true,
      status: true,
      life_number: true,
      start_date: true,
      end_date: true,
    },
  });
}

export function contractTerms(row: Contract) {
  return priceTermsSchema.parse(JSON.parse(row.terms_json));
}
