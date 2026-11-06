// The customer's path through the real services, for the end-to-end card tests in
// src/server/scenarios/: quote → application (the question flow answered from the customer's
// data-pack record) → signing, each on the day passed in. Nothing here knows a card.
import { loadCustomers } from '@/data/load';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import type { Answer } from '@/domain/question-flow/engine';
import { createApplication, type CreateApplicationResult } from '@/server/applications';
import { signContract, type SignContractResult } from '@/server/contracts';
import { listInvoices, payInvoice } from '@/server/invoices';
import type { PrismaClient } from '@/server/prisma-client';
import { createQuote, loadPricingData, type CreateQuoteResult } from '@/server/quotes';

export type Trip = {
  customerId: string;
  assetId: string;
  termMonths: number;
  downPaymentCents?: number;
  /** The quote day; the application is made on it too. */
  quoteOn: string;
  answers?: Record<string, Answer>;
};

/** Quotes and applies; throws when the quote or the application is not written. */
export async function quoteAndApply(db: PrismaClient, trip: Trip) {
  const quote: CreateQuoteResult = await createQuote(
    db,
    {
      assetId: trip.assetId,
      termMonths: trip.termMonths,
      downPaymentCents: trip.downPaymentCents ?? 0,
      today: trip.quoteOn,
      actor: trip.customerId,
    },
    await loadPricingData()
  );
  if (!quote.ok) throw new Error(`quote refused: ${quote.reason.code}`);
  const customer = (await loadCustomers()).find((c) => c.id === trip.customerId);
  if (!customer) throw new Error(`no customer ${trip.customerId} in the data pack`);
  const applied: CreateApplicationResult = await createApplication(db, {
    quoteId: quote.quote.id,
    customerId: trip.customerId,
    answers: { ...answersFromCustomer(customer), ...trip.answers },
    today: trip.quoteOn,
    actor: trip.customerId,
  });
  if (!applied.ok) throw new Error(`application refused: ${applied.reason}`);
  return { quote: quote.quote, application: applied.application };
}

/** Signs `applicationId` on `signOn` as its customer; returns the service's answer as is. */
export async function sign(
  db: PrismaClient,
  applicationId: string,
  actor: string,
  signOn: string
): Promise<SignContractResult> {
  return signContract(db, { applicationId, actor }, signOn, await loadPricingData());
}

/** Quote, apply (must be approved), sign; throws on any refusal. */
export async function signedContract(db: PrismaClient, trip: Trip, signOn = trip.quoteOn) {
  const { quote, application } = await quoteAndApply(db, trip);
  if (application.decision !== 'approved') {
    throw new Error(`application is ${application.decision}, not approved`);
  }
  const signed = await sign(db, application.id, trip.customerId, signOn);
  if (!signed.ok) throw new Error(`signing refused: ${signed.reason.code}`);
  return { quote, application, ...signed.details };
}

/** Pays the first `count` rents, each on its own due day, as the contract's customer. */
export async function payRents(
  db: PrismaClient,
  contractId: string,
  count: number,
  actor: string
): Promise<void> {
  const rents = (await listInvoices(db, contractId)).filter((i) => i.kind === 'rent');
  for (const rent of rents.slice(0, count)) {
    const paid = await payInvoice(db, { id: rent.id, paidOn: rent.dueDate, actor });
    if (!paid.ok) throw new Error(`payment refused: ${paid.reason}`);
  }
}
