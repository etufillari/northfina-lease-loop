// Optional demo data: three leases that have ended with all rent paid, so the end-of-term
// choices can be shown today. Separate from `db:seed` so the scenario cards are untouched.
// Price lists start in 2026, so each lease is signed normally and then moved back a year.
import { createApplication } from '@/server/applications/applications';
import { withAudit } from '@/server/audit';
import { createContract } from '@/server/contracts/contracts';
import { generateInvoices } from '@/server/invoicing/invoices';
import { recordPayment } from '@/server/payments/payments';
import { createPrismaClient } from '@/server/prisma-client';
import { todayIso } from '@/server/today';

const actor = 'demo-seed';
const signedOn = '2026-01-15';
const assetIds = ['ebike-012', 'ebike-002', 'laptop-010'];
const answers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};

const db = createPrismaClient();

function aYearEarlier(date: string): string {
  return `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
}

async function seedFinishedLease(assetId: string): Promise<string> {
  const application = await createApplication(db, {
    customerId: 'cust-aino',
    assetId,
    date: signedOn,
    downPaymentCents: 0,
    termMonths: 12,
    actor,
    answers,
  });
  if (!application.ok) throw new Error(`Application failed: ${application.reason}`);

  const signed = await createContract(db, {
    applicationId: application.application.id,
    signedOn,
    actor,
  });
  if (!signed.ok) throw new Error(`Contract failed: ${signed.reason}`);

  const contractId = signed.contract.id;
  const row = await db.contract.findUniqueOrThrow({ where: { id: contractId } });
  await withAudit(
    db,
    {
      actor,
      action: 'demo.lease_backdated',
      entityType: 'contract',
      entityId: contractId,
      details: { startsOn: aYearEarlier(row.starts_on), endsOn: aYearEarlier(row.ends_on) },
    },
    async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          signed_on: aYearEarlier(signedOn),
          starts_on: aYearEarlier(row.starts_on),
          ends_on: aYearEarlier(row.ends_on),
        },
      });
      await tx.asset.update({
        where: { id: assetId },
        data: { first_leased_on: aYearEarlier(row.starts_on) },
      });
      await tx.assetHistory.updateMany({
        where: { contract_id: contractId, event_type: 'lease_started' },
        data: { occurred_on: aYearEarlier(row.starts_on) },
      });
    }
  );

  const today = todayIso();
  const invoices = await generateInvoices(db, { contractId, actor }, today);
  if (!invoices.ok) throw new Error(`Invoices failed: ${invoices.reason}`);
  for (const invoice of invoices.invoices) {
    const paid = await recordPayment(
      db,
      {
        contractId,
        invoiceId: invoice.id,
        amountCents: invoice.totalCents,
        paidOn: invoice.dueOn,
        actor,
      },
      today
    );
    if (!paid.ok) throw new Error(`Payment failed: ${paid.reason}`);
  }
  return contractId;
}

async function main() {
  for (const assetId of assetIds) {
    const existing = await db.application.findFirst({
      where: { asset_id: assetId, customer_id: 'cust-aino' },
      include: { contract: true },
    });
    if (existing?.contract) {
      console.log(`⏭️  ${assetId}: /en/contracts/${existing.contract.id}`);
      continue;
    }
    console.log(`🌱 ${assetId}: /en/contracts/${await seedFinishedLease(assetId)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
