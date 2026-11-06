// Writes the simulated trading history that gives the admin dashboard something to report.
// Every row is an ordinary contract, invoice, payment or event, marked as demo and written with
// an audit entry, so the charts read recorded data and never a separate set of fake points.
// Safe to run again: anything that already exists is left alone.
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { loadAssets, loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { planDemoHistory, type PlannedLease } from '@/domain/demo-history';
import { withAudit } from './audit';

export const demoHistoryActor = 'system:demo-history';
const firstNames = ['Aada', 'Eero', 'Helmi', 'Ilmari', 'Kerttu', 'Lauri', 'Oona', 'Sampo'];
const lastNames = ['Aalto', 'Heikkinen', 'Koskela', 'Laine', 'Mäkelä', 'Niemi', 'Saari', 'Vainio'];
export const demoCustomerCount = firstNames.length * lastNames.length;

export function demoCustomerId(index: number) {
  return `demo-customer-${index % demoCustomerCount}`;
}

/** Fictional customers with no login, so nobody can sign in as one. */
export async function ensureDemoCustomers(db: PrismaClient) {
  const existing = await db.customer.count({ where: { id: { startsWith: 'demo-customer-' } } });
  if (existing >= demoCustomerCount) return;
  await withAudit(
    db,
    {
      actor: demoHistoryActor,
      action: 'demo.customers_seeded',
      entityType: 'customer',
      entityId: 'demo-customer',
      details: { count: demoCustomerCount },
    },
    async (tx) => {
      for (let index = 0; index < demoCustomerCount; index++) {
        const first = firstNames[index % firstNames.length]!;
        const last = lastNames[Math.floor(index / firstNames.length)]!;
        await tx.user.upsert({
          where: { id: `demo-user-${index}` },
          update: {},
          create: {
            id: `demo-user-${index}`,
            name: `${first} ${last}`,
            email: `demo.customer.${index}@example.com`,
          },
        });
        await tx.customer.upsert({
          where: { id: demoCustomerId(index) },
          update: {},
          create: { id: demoCustomerId(index), ownerUserId: `demo-user-${index}` },
        });
      }
    }
  );
}

export function contractDates(startDate: string) {
  return { createdAt: new Date(`${startDate}T09:00:00.000Z`) };
}

/** The invoice, payment and event rows shared by history leases and open cases. */
export function billingRows(
  contractId: string,
  invoices: PlannedLease['invoices']
): {
  invoices: Prisma.InvoiceCreateManyInput[];
  payments: Prisma.PaymentCreateManyInput[];
  events: Prisma.LeaseEventCreateManyInput[];
} {
  const paid = invoices.filter((invoice) => invoice.paid);
  const id = (dueDate: string) => `${contractId}-${dueDate}`;
  return {
    invoices: invoices.map((invoice) => ({
      id: id(invoice.dueDate),
      contractId,
      dueDate: invoice.dueDate,
      issuedDate: invoice.dueDate,
      netCents: invoice.netCents,
      vatBasisPoints: invoice.vatBasisPoints,
      vatCents: invoice.vatCents,
    })),
    payments: paid.map((invoice) => ({
      invoiceId: id(invoice.dueDate),
      amountCents: invoice.totalCents,
      paidDate: invoice.dueDate,
      isSimulated: true,
    })),
    events: paid.map((invoice) => ({
      contractId,
      kind: 'payment',
      eventDate: invoice.dueDate,
    })),
  };
}

async function writeLease(db: PrismaClient, lease: PlannedLease) {
  const number = String(lease.sequence).padStart(4, '0');
  const contractId = `hist-${number}`;
  const assetId = `fleet-${number}`;
  await withAudit(
    db,
    {
      actor: demoHistoryActor,
      action: 'demo.lease_seeded',
      entityType: 'contract',
      entityId: contractId,
      details: { status: lease.status, category: lease.category, startDate: lease.startDate },
    },
    async (tx) => {
      await tx.asset.create({
        data: {
          id: assetId,
          category: lease.category,
          make: lease.source.make,
          model: lease.source.model,
          model_year: Number(lease.startDate.slice(0, 4)),
          serial_number: `LL-FL-${number}`,
          condition: lease.status === 'active' ? 'new' : 'good',
          usage_unit: lease.source.usageUnit,
          usage_value: lease.usageValue,
          previous_lives: lease.status === 'returned' || lease.status === 'completed' ? 1 : 0,
          // Bought items stay reserved, as a real buyout leaves them; fleet rows are never offered.
          status:
            lease.status === 'returned' || lease.status === 'completed' ? 'returned' : 'reserved',
          originalPriceCents: lease.listPriceCents,
          firstLeaseDate: lease.startDate,
          isFleetHistory: true,
        },
      });
      await tx.contract.create({
        data: {
          id: contractId,
          customerId: demoCustomerId(lease.sequence),
          assetId,
          startDate: lease.startDate,
          termMonths: lease.termMonths,
          listPriceCents: lease.listPriceCents,
          downPaymentCents: lease.downPaymentCents,
          monthlyNetCents: lease.monthlyNetCents,
          buyoutCents: lease.buyoutCents,
          priceListVersion: lease.priceListVersion,
          status: lease.status,
          isDemo: true,
          annualRateBasisPoints: lease.annualRateBasisPoints,
          startCondition: 'new',
          startUsageValue: 0,
          endedOn: lease.endedOn,
          ...contractDates(lease.startDate),
        },
      });
      const rows = billingRows(contractId, lease.invoices);
      await tx.invoice.createMany({ data: rows.invoices });
      await tx.payment.createMany({ data: rows.payments });
      const closing =
        lease.status === 'returned' || lease.status === 'completed'
          ? [{ contractId, kind: 'returned', eventDate: lease.endedOn! }]
          : [];
      await tx.leaseEvent.createMany({
        data: [
          { contractId, kind: 'signed', eventDate: lease.startDate },
          ...rows.events,
          ...closing,
        ],
      });
      if (lease.buyout)
        await tx.leaseActionPayment.create({
          data: {
            contractId,
            reference: `${contractId}-buyout`,
            kind: 'buyout',
            amountCents: lease.buyout.totalCents,
            paymentMethod: 'card',
            quoteJson: JSON.stringify(lease.buyout.quote),
            isSimulated: true,
            createdAt: new Date(`${lease.buyout.date}T09:00:00.000Z`),
          },
        });
    }
  );
}

export const demoHistoryMonths = 24;

/** Adds the leases missing from the plan and reports how many were written. */
export async function seedDemoLeases(db: PrismaClient, today: string) {
  const [assets, priceLists, table, vat] = await Promise.all([
    loadAssets(),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const plan = planDemoHistory({
    today,
    months: demoHistoryMonths,
    catalogue: assets.map((asset) => ({
      id: asset.id,
      category: asset.category,
      make: asset.make,
      model: asset.model,
      usageUnit: asset.usage.unit,
    })),
    priceLists,
    table,
    rates: vat.rates,
  });
  await ensureDemoCustomers(db);
  const existing = new Set(
    (
      await db.contract.findMany({
        where: { id: { startsWith: 'hist-' } },
        select: { id: true },
      })
    ).map((row) => row.id)
  );
  let created = 0;
  for (const lease of plan) {
    if (existing.has(`hist-${String(lease.sequence).padStart(4, '0')}`)) continue;
    await writeLease(db, lease);
    created++;
  }
  return { created, skipped: plan.length - created };
}
