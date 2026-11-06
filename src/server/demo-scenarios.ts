// Writes the lease a demo persona already has (see src/domain/demo-scenarios.ts). Runs inside
// the persona switch's audited transaction; safe to run again.
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { planScenarioLease, type ScenarioLease } from '@/domain/demo-scenarios';
import type { TransactionClient } from './audit';
import { billingRows, contractDates } from './demo-history';

export const scenarioContractId = (customerId: string, assetId: string) =>
  `demo-scenario-${customerId}-${assetId}`;

/**
 * Creates the persona's scenario lease if it doesn't exist yet, the demo date has reached its
 * start date and the item is still available. Returns the new contract ID, otherwise null.
 */
export async function ensureScenarioLease(
  tx: TransactionClient,
  customerId: string,
  lease: ScenarioLease,
  today: string
): Promise<string | null> {
  const contractId = scenarioContractId(customerId, lease.assetId);
  if (await tx.contract.findUnique({ where: { id: contractId }, select: { id: true } }))
    return null;
  const [priceLists, table, vat] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const plan = planScenarioLease(lease, today, priceLists, table, vat.rates);
  if (!plan) return null;
  const asset = await tx.asset.findUnique({
    where: { id: lease.assetId },
    select: {
      status: true,
      condition: true,
      usage_value: true,
      originalPriceCents: true,
      firstLeaseDate: true,
    },
  });
  // Someone else leased it in this demo: leave their lease alone.
  if (!asset || asset.status !== 'available') return null;
  // The same writes checkout makes when a customer signs.
  await tx.asset.update({
    where: { id: lease.assetId },
    data: {
      status: 'reserved',
      originalPriceCents: asset.originalPriceCents ?? plan.listPriceCents,
      firstLeaseDate: asset.firstLeaseDate ?? lease.startDate,
    },
  });
  await tx.contract.create({
    data: {
      id: contractId,
      customerId,
      assetId: lease.assetId,
      startDate: lease.startDate,
      termMonths: lease.termMonths,
      listPriceCents: plan.listPriceCents,
      downPaymentCents: lease.downPaymentCents,
      startCondition: asset.condition,
      startUsageValue: asset.usage_value,
      annualRateBasisPoints: plan.annualRateBasisPoints,
      monthlyNetCents: plan.monthlyNetCents,
      buyoutCents: plan.buyoutCents,
      priceListVersion: plan.priceListVersion,
      isDemo: true,
      ...contractDates(lease.startDate),
      events: { create: { kind: 'signed', eventDate: lease.startDate } },
    },
  });
  const rows = billingRows(contractId, plan.invoices);
  await tx.invoice.createMany({ data: rows.invoices });
  await tx.payment.createMany({ data: rows.payments });
  await tx.leaseEvent.createMany({ data: rows.events });
  return contractId;
}
