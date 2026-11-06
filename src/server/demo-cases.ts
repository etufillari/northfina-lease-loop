// Open cases for the staff queue, on data-pack items. They run through the real recovery services,
// so their quotes, statuses and audit trail are produced the same way a real return's would be.
// The returned items end up exactly as the data pack describes them, now with a lease behind them.
import type { PrismaClient } from '@/generated/prisma/client';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { AssetCategory, AssetCondition } from '@/data/schemas';
import { recoveryAgeMonths, recoveryFirstUseDate } from '@/domain/asset-recovery';
import { monthlyFactorFor } from '@/domain/coefficient';
import {
  evaluateInspection,
  inspectionChecks,
  type CheckResult,
  type DamageEntry,
  type InspectionRecord,
} from '@/domain/inspection';
import { forecastInvoices, quoteAmounts } from '@/domain/lease-billing';
import { listPriceOn } from '@/domain/price-list';
import { withAudit } from './audit';
import {
  billingRows,
  contractDates,
  demoCustomerId,
  demoHistoryActor,
  ensureDemoCustomers,
} from './demo-history';
import { requestLeaseChange } from './leases';
import { acceptReturn, assessReturn, progressReturn } from './recovery';

export const demoInspectorId = 'demo-inspector';

type Findings = Record<string, { result: CheckResult; repairCents?: number; note?: string }>;

type ReturnedCase = {
  assetId: string;
  monthsAgo: number;
  termMonths: number;
  startCondition: AssetCondition;
  startUsage: number;
  targetCondition: 'good' | 'like_new';
  report: { issues: string[]; notes: string };
  findings: Findings;
  readings: Record<string, number>;
  damage: DamageEntry[];
  notes: string;
  /** An item still available in the catalogue, returned here with these findings instead. */
  damaged?: { condition: AssetCondition; usage: number };
};

/** The returned items in the data pack, keeping their recorded condition and usage. */
const returnedCases: readonly ReturnedCase[] = [
  {
    // A badly treated laptop, to show how real repair costs move the numbers.
    assetId: 'laptop-003',
    monthsAgo: 14,
    termMonths: 36,
    startCondition: 'new',
    startUsage: 0,
    targetCondition: 'good',
    damaged: { condition: 'poor', usage: 410 },
    report: {
      issues: ['screen_damage', 'keyboard_fault', 'cooling_fault', 'hinge_fault', 'battery_weak'],
      notes: 'It fell off a desk. Screen is cracked, fan is loud, some keys stopped working.',
    },
    findings: {
      display: { result: 'repair', repairCents: 40000, note: 'Cracked panel. Replace.' },
      keyboard: { result: 'repair', repairCents: 25000, note: 'Top case and keyboard replaced.' },
      chassis_hinges: { result: 'repair', repairCents: 25000, note: 'Left hinge snapped.' },
      cooling: { result: 'repair', repairCents: 10000, note: 'Fan seized. Replace, new paste.' },
      ports: { result: 'repair', repairCents: 9000, note: 'One USB-C port torn off.' },
      battery_pack: { result: 'repair', repairCents: 9000, note: 'At 61 % after 14 months.' },
      trackpad: { result: 'wear' },
    },
    readings: { battery_health: 61, storage_health: 94, dead_pixels: 200 },
    damage: [{ area: 'Lid', type: 'dent', liability: 'chargeable', repairCents: 12000 }],
    notes:
      'Heavy drop damage. Replace panel, top case, hinge, fan, port and battery; repair the lid.',
  },
  {
    assetId: 'ebike-007',
    monthsAgo: 26,
    termMonths: 36,
    startCondition: 'good',
    startUsage: 2600,
    targetCondition: 'good',
    report: {
      issues: ['brakes_fault', 'battery_weak'],
      notes: 'Brakes feel soft. Range has dropped.',
    },
    findings: {
      brakes: { result: 'repair', repairCents: 6500, note: 'Pads under limit, rotor scored.' },
      battery_pack: { result: 'repair', note: 'Over the km limit: replacement planned.' },
      tyres: { result: 'wear' },
      drivetrain: { result: 'wear' },
    },
    readings: { battery_health: 71, charge_cycles: 410, brake_pad: 1 },
    damage: [
      { area: 'Cargo box corner', type: 'crack', liability: 'chargeable', repairCents: 9000 },
    ],
    notes:
      'High mileage for its age. Replace pads, rotor and battery; replace the cargo box corner.',
  },
  {
    assetId: 'ebike-008',
    monthsAgo: 18,
    termMonths: 36,
    startCondition: 'good',
    startUsage: 6400,
    targetCondition: 'good',
    report: { issues: ['cosmetic_scratches'], notes: 'Normal scratches on the frame.' },
    findings: { tyres: { result: 'wear' }, drivetrain: { result: 'wear' } },
    readings: { battery_health: 88, charge_cycles: 190, brake_pad: 3 },
    damage: [{ area: 'Top tube', type: 'scratch', liability: 'fair_wear', repairCents: 0 }],
    notes: 'Ordinary wear only. Safety inspection before its third life.',
  },
  {
    assetId: 'ebike-011',
    monthsAgo: 20,
    termMonths: 36,
    startCondition: 'like_new',
    startUsage: 900,
    targetCondition: 'good',
    report: {
      issues: ['tyres_worn', 'missing_accessories'],
      notes: 'Delivery use. I can no longer find the second charger.',
    },
    findings: {
      accessories_complete: {
        result: 'repair',
        repairCents: 12000,
        note: 'Second charger missing.',
      },
      drivetrain: { result: 'wear', note: 'Worn but within limits for its age.' },
      tyres: { result: 'wear' },
      battery_pack: { result: 'wear', note: 'Over the km limit: replacement planned.' },
    },
    readings: { battery_health: 76, charge_cycles: 520, brake_pad: 2 },
    damage: [],
    notes: 'Commercial use, in good order. Replace the charger and the battery.',
  },
  {
    assetId: 'laptop-006',
    monthsAgo: 16,
    termMonths: 36,
    startCondition: 'like_new',
    startUsage: 30,
    targetCondition: 'good',
    report: { issues: [], notes: 'No problems.' },
    findings: { keyboard: { result: 'wear' } },
    readings: { battery_health: 87, storage_health: 96, dead_pixels: 0 },
    damage: [],
    notes: 'Light keyboard shine. Certified wipe, then ready.',
  },
  {
    assetId: 'laptop-007',
    monthsAgo: 25,
    termMonths: 36,
    startCondition: 'good',
    startUsage: 240,
    targetCondition: 'good',
    report: { issues: ['screen_damage', 'battery_weak'], notes: 'Lines on the screen.' },
    findings: {
      display: { result: 'repair', repairCents: 21000, note: 'Panel replacement.' },
      battery_pack: { result: 'repair', note: 'Over the cycle limit: replacement planned.' },
    },
    readings: { battery_health: 64, storage_health: 91, dead_pixels: 40 },
    damage: [{ area: 'Lid corner', type: 'dent', liability: 'chargeable', repairCents: 6000 }],
    notes: 'New panel and battery. Lid dent is new since the start of this lease.',
  },
  {
    assetId: 'farm-005',
    monthsAgo: 27,
    termMonths: 48,
    startCondition: 'good',
    startUsage: 3100,
    targetCondition: 'good',
    report: { issues: ['service_due'], notes: 'Service is due.' },
    findings: {
      hydraulics: { result: 'wear', note: 'Slight seepage at one coupling, within limits.' },
      tyres: { result: 'wear' },
      service_records: { result: 'repair', note: 'Missing the last service stamp.' },
    },
    readings: { tyre_tread: 28, last_service_hours: 3400, hydraulic_pressure: 190 },
    damage: [{ area: 'Rear mudguard', type: 'dent', liability: 'fair_wear', repairCents: 0 }],
    notes: 'Major service due by hours. No structural findings.',
  },
];

type PendingCase = {
  assetId: string;
  monthsAgo: number;
  termMonths: number;
  usageNow: number;
  report: { condition: AssetCondition; issues: string[]; notes: string };
};

/** Items still with their customer, each waiting for its first assessment. */
const pendingCases: readonly PendingCase[] = [
  {
    assetId: 'ebike-012',
    monthsAgo: 9,
    termMonths: 36,
    usageNow: 2400,
    report: {
      condition: 'good',
      issues: ['brakes_fault', 'cosmetic_scratches'],
      notes: 'Moving abroad. The rear brake squeals and there are scratches on the frame.',
    },
  },
  {
    assetId: 'laptop-010',
    monthsAgo: 11,
    termMonths: 24,
    usageNow: 190,
    report: {
      condition: 'good',
      issues: ['keyboard_fault'],
      notes: 'Two keys stick. Otherwise fine.',
    },
  },
  {
    assetId: 'farm-008',
    monthsAgo: 14,
    termMonths: 36,
    usageNow: 420,
    report: {
      condition: 'fair',
      issues: ['hydraulic_fault', 'dents'],
      notes: 'Leak at a hydraulic hose, and the guard took a knock.',
    },
  },
];

function recordFor(category: AssetCategory, item: ReturnedCase): InspectionRecord {
  return {
    usageSource: category === 'laptop' ? 'diagnostic_tool' : 'display',
    customerPresent: false,
    checks: inspectionChecks(category).map(({ id }) => ({
      id,
      result: item.findings[id]?.result ?? 'pass',
      repairCents: item.findings[id]?.repairCents ?? 0,
      note: item.findings[id]?.note ?? '',
    })),
    readings: Object.entries(item.readings).map(([id, value]) => ({ id, value })),
    damage: item.damage,
  };
}

/** Puts an item into a running lease, as it was before the customer asked to return it. */
async function startCaseLease(
  db: PrismaClient,
  item: {
    assetId: string;
    monthsAgo: number;
    termMonths: number;
    startCondition: AssetCondition;
    startUsage: number;
    previousLives: number;
    customerIndex: number;
    today: string;
  }
) {
  const [priceLists, table, vat] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const startDate = recoveryFirstUseDate(item.today, item.monthsAgo);
  const listed = listPriceOn(priceLists, item.assetId, startDate);
  const earliest = priceLists[0]?.prices[item.assetId];
  const priceCents = listed.ok ? listed.priceCents : earliest;
  if (priceCents === undefined) throw new Error(`No price for ${item.assetId}`);
  const factor = monthlyFactorFor(table, priceCents, item.termMonths);
  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(item.termMonths)];
  if (!factor.ok || buyoutPercent === undefined) throw new Error(`No quote for ${item.assetId}`);
  const quote = quoteAmounts(priceCents, factor.factor, buyoutPercent);
  const schedule = forecastInvoices(startDate, item.termMonths, quote.monthlyNetCents, vat.rates);
  if (!schedule.ok) throw new Error(`No schedule for ${item.assetId}`);
  const contractId = `hist-case-${item.assetId}`;
  await withAudit(
    db,
    {
      actor: demoHistoryActor,
      action: 'demo.case_seeded',
      entityType: 'contract',
      entityId: contractId,
      details: { assetId: item.assetId, startDate },
    },
    async (tx) => {
      await tx.asset.update({
        where: { id: item.assetId },
        data: {
          status: 'reserved',
          condition: item.startCondition,
          usage_value: item.startUsage,
          previous_lives: item.previousLives,
          originalPriceCents: priceCents,
          firstLeaseDate: startDate,
        },
      });
      await tx.contract.create({
        data: {
          id: contractId,
          customerId: demoCustomerId(item.customerIndex),
          assetId: item.assetId,
          startDate,
          termMonths: item.termMonths,
          listPriceCents: priceCents,
          downPaymentCents: 0,
          ...quote,
          priceListVersion: listed.ok ? listed.priceListVersion : 0,
          isDemo: true,
          annualRateBasisPoints: Math.round(factor.band.annual_interest_percent * 100),
          startCondition: item.startCondition,
          startUsageValue: item.startUsage,
          ...contractDates(startDate),
        },
      });
      const rows = billingRows(
        contractId,
        schedule.invoices
          .filter((invoice) => invoice.dueDate <= item.today)
          .map((invoice) => ({ ...invoice, paid: true }))
      );
      await tx.invoice.createMany({ data: rows.invoices });
      await tx.payment.createMany({ data: rows.payments });
      await tx.leaseEvent.createMany({
        data: [{ contractId, kind: 'signed', eventDate: startDate }, ...rows.events],
      });
    }
  );
  return { contractId, startDate };
}

async function ensureInspector(db: PrismaClient) {
  if (await db.user.findUnique({ where: { id: demoInspectorId }, select: { id: true } })) return;
  await withAudit(
    db,
    {
      actor: demoHistoryActor,
      action: 'demo.inspector_seeded',
      entityType: 'user',
      entityId: demoInspectorId,
    },
    (tx) =>
      tx.user.create({
        data: {
          id: demoInspectorId,
          name: 'Demo inspector',
          email: 'demo.inspector@example.com',
          role: 'staff',
        },
      })
  );
}

/** Seeds items untouched since the data pack only, so nobody's own test data is overwritten. */
export async function seedDemoCases(db: PrismaClient, today: string) {
  await ensureDemoCustomers(db);
  await ensureInspector(db);
  const untouched = await db.asset.findMany({
    where: {
      id: { in: [...returnedCases, ...pendingCases].map((item) => item.assetId) },
      contracts: { none: {} },
    },
  });
  const assets = new Map(untouched.map((asset) => [asset.id, asset]));
  let created = 0;

  for (const [index, item] of returnedCases.entries()) {
    const asset = assets.get(item.assetId);
    if (!asset || asset.status !== (item.damaged ? 'available' : 'returned')) continue;
    const category = asset.category as AssetCategory;
    const { contractId, startDate } = await startCaseLease(db, {
      ...item,
      previousLives: item.damaged ? asset.previous_lives : Math.max(0, asset.previous_lives - 1),
      customerIndex: index,
      today,
    });
    const returnedCondition = item.damaged?.condition ?? (asset.condition as AssetCondition);
    const returnedUsage = item.damaged?.usage ?? asset.usage_value;
    const customerId = demoCustomerId(index);
    const userId = `demo-user-${index % 64}`;
    const { id: requestId } = await requestLeaseChange(db, {
      customerId,
      userId,
      contractId,
      kind: 'return',
      report: {
        condition: returnedCondition,
        usageValue: returnedUsage,
        ...item.report,
      },
    });
    const record = recordFor(category, item);
    const assessment = await assessReturn(db, {
      requestId,
      staffId: demoInspectorId,
      today,
      inspection: {
        // The data pack's recorded facts stay exactly as supplied.
        condition: returnedCondition,
        targetCondition: item.targetCondition,
        usageValue: returnedUsage,
        ageMonths: recoveryAgeMonths(startDate, today),
        additionalRepairCents: evaluateInspection(category, record).repairNetCents,
        notes: item.notes,
        record,
      },
    });
    await acceptReturn(db, {
      requestId,
      contractId,
      customerId,
      userId,
      today,
      action: 'accept',
      expectedAssessmentUpdatedAt: assessment.updatedAt.toISOString(),
      paymentMethod: 'card',
    });
    await progressReturn(db, { requestId, staffId: demoInspectorId, today, action: 'receive' });
    created++;
  }

  for (const [index, item] of pendingCases.entries()) {
    const asset = assets.get(item.assetId);
    if (!asset || asset.status !== 'available') continue;
    const customerIndex = returnedCases.length + index;
    const { contractId } = await startCaseLease(db, {
      ...item,
      startCondition: asset.condition as AssetCondition,
      startUsage: asset.usage_value,
      previousLives: asset.previous_lives,
      customerIndex,
      today,
    });
    await requestLeaseChange(db, {
      customerId: demoCustomerId(customerIndex),
      userId: `demo-user-${customerIndex % 64}`,
      contractId,
      kind: 'return',
      report: { ...item.report, usageValue: item.usageNow },
    });
    created++;
  }
  return { created };
}
