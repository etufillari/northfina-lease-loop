// Shared setup for tests of what happens after an application: a clean database, and a quick
// way to get an application or a signed contract.
import { loadAssets, loadCustomers } from '@/data/load';
import type { Answers } from '@/data/lease-schemas';
import type { Customer } from '@/data/schemas';
import { submitApplication } from '@/server/application/applications';
import { seedAssets } from '@/server/assets/assets';
import { signContract } from '@/server/contract/contracts';
import type { PrismaClient } from '@/server/prisma-client';

/** Empties everything a test can write, puts the assets back and sets the demo date. */
export async function resetLeaseData(db: PrismaClient, date = '2026-11-05') {
  await db.auditLog.deleteMany();
  await db.assetLife.deleteMany();
  await db.invoice.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.asset.deleteMany();
  await db.appSetting.deleteMany();
  await seedAssets(db, await loadAssets());
  await db.appSetting.create({ data: { key: 'demo_date', value: date } });
}

export async function findCustomer(id: string): Promise<Customer> {
  const found = (await loadCustomers()).find((customer) => customer.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return found;
}

export async function applyFor(
  db: PrismaClient,
  customerId: string,
  assetId: string,
  answers: Answers,
  deal: { termMonths?: number; downPaymentCents?: number } = {}
) {
  const result = await submitApplication(db, {
    customer: await findCustomer(customerId),
    assetId,
    termMonths: deal.termMonths ?? 36,
    downPaymentCents: deal.downPaymentCents ?? 0,
    answers,
  });
  if (!result.ok) throw new Error(`application failed: ${result.reason}`);
  return result.application;
}

export async function signFor(
  db: PrismaClient,
  customerId: string,
  applicationId: string,
  signatoryId?: string
) {
  const customer = await findCustomer(customerId);
  const result = await signContract(db, { applicationId, customer, signatoryId });
  if (!result.ok) throw new Error(`signing failed: ${result.reason}`);
  return result.contract;
}
