import { randomUUID } from 'node:crypto';
import { loadAssets, loadCustomers } from '@/data/load';
import { answersFromCustomer } from '@/domain/question-flow';
import { seedAssets } from '@/server/assets';
import type { DemoContext } from '@/server/demo-context';
import type { PrismaClient } from '@/server/prisma-client';
import { submitApplication } from '@/server/spine-applications';
import { createQuote } from '@/server/spine-quotes';
import { signContract } from '@/server/spine-signing';

export async function resetSpine(db: PrismaClient) {
  await db.waitingRequest.deleteMany();
  await db.invoice.deleteMany();
  await db.assetLease.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.quote.deleteMany();
  await db.assetRelease.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
}

export async function demoContext(
  customerId = 'cust-aino',
  businessDate = '2026-11-05',
  operator = false
): Promise<DemoContext> {
  const customer = (await loadCustomers()).find((item) => item.id === customerId);
  if (!customer) throw new Error('Unknown fixture customer');
  return {
    customer,
    businessDate,
    operator,
    simulated: true,
    actor: operator ? 'demo:operator:dealer' : `demo:customer:${customerId}`,
  };
}

export async function prepareApplication(
  db: PrismaClient,
  context: DemoContext,
  input: {
    assetId?: string;
    termMonths?: number;
    downPaymentCents?: number;
    startDate?: string;
  } = {}
) {
  const quote = await createQuote(db, context, {
    requestId: randomUUID(),
    assetId: input.assetId ?? 'ebike-003',
    termMonths: input.termMonths ?? 36,
    downPaymentCents: input.downPaymentCents ?? 0,
    startDate: input.startDate ?? context.businessDate,
  });
  const answers = {
    ...answersFromCustomer(context.customer),
    q_usage_purpose: 'commuting',
    q_farm_registry: 'SYNTHETIC-FARM-1',
    q_pep_details: 'Synthetic public-office fixture',
  };
  const application = await submitApplication(db, context, {
    requestId: randomUUID(),
    quoteId: quote.id,
    answers,
  });
  return { quote, application };
}

export async function createLease(
  db: PrismaClient,
  context: DemoContext,
  input: Parameters<typeof prepareApplication>[2] = {}
) {
  const { application } = await prepareApplication(db, context, input);
  if (application.decision !== 'approved')
    throw new Error(`Fixture was not approved: ${application.reasons.join(', ')}`);
  return signContract(db, context, application.id);
}
