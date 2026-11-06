import type { PrismaClient } from '@/generated/prisma/client';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import { assetCategorySchema, assetConditionSchema } from '@/data/schemas';
import { recoveryAgeMonths, recoveryFirstUseDate } from '@/domain/asset-recovery';
import { conditionDamageCost } from '@/domain/condition-report';
import { batteryIsRepairLine, conditionsUpTo, evaluateInspection } from '@/domain/inspection';
import { withAgreedReturnPrice } from '@/domain/lease-settlement';
import { quoteReturn } from '@/domain/return-preview';
import { monthlyFactorFor } from '@/domain/coefficient';
import { summarizeLease } from '@/domain/lease-dashboard';
import { ApiError } from './api-response';
import { withAudit, type TransactionClient } from './audit';
import { leaseActionContext, settleOpenRent } from './lease-actions';
import {
  inspectionSchema,
  recoveryCalculationSchema,
  recoveryReportSchema,
  type RecoveryCalculation,
  type RecoveryInspection,
} from './recovery-input';

const includeCase = {
  contract: {
    include: {
      asset: true,
      customer: { select: { owner: { select: { name: true, email: true } } } },
      invoices: { include: { payments: true } },
    },
  },
  assessment: true,
} as const;
export async function listReturnCases(db: PrismaClient) {
  return db.leaseRequest.findMany({
    where: { kind: { in: ['return', 'buyout', 'exchange'] } },
    include: includeCase,
    orderBy: { createdAt: 'desc' },
  });
}
export async function findReturnCase(db: PrismaClient, requestId: string) {
  return db.leaseRequest.findFirst({
    where: { id: requestId, kind: { in: ['return', 'buyout', 'exchange'] } },
    include: includeCase,
  });
}
export type ReturnCase = NonNullable<Awaited<ReturnType<typeof findReturnCase>>>;

async function staffInTransaction(tx: TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== 'staff') throw new ApiError(403, 'FORBIDDEN', 'Access denied.');
}
function calculation(text: string): RecoveryCalculation {
  return recoveryCalculationSchema.parse(JSON.parse(text));
}

export async function assessReturn(
  db: PrismaClient,
  input: { requestId: string; staffId: string; today: string; inspection: RecoveryInspection }
) {
  const inspection = inspectionSchema.parse(input.inspection);
  const [curves, costs, table, vat] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  return withAudit(
    db,
    {
      actor: input.staffId,
      action: 'return.assessed',
      entityType: 'lease_request',
      entityId: input.requestId,
    },
    async (tx) => {
      await staffInTransaction(tx, input.staffId);
      const request = await tx.leaseRequest.findFirst({
        where: { id: input.requestId, kind: { in: ['return', 'buyout', 'exchange'] } },
        include: includeCase,
      });
      if (!request) throw new ApiError(404, 'NOT_FOUND', 'Return request not found.');
      if (
        request.status === 'cancelled' ||
        request.contract.status !== 'active' ||
        (request.assessment && request.assessment.status !== 'quoted')
      )
        throw new ApiError(409, 'RETURN_STATE', 'This request cannot be assessed.');
      const { contract } = request;
      const asset = contract.asset;
      if (inspection.usageValue < asset.usage_value)
        throw new ApiError(400, 'INVALID_INSPECTION', 'Usage cannot go backwards.');
      const firstLease = await tx.contract.findFirst({
        where: { assetId: asset.id },
        orderBy: { startDate: 'asc' },
        select: { listPriceCents: true },
      });
      const originalPriceCents =
        asset.originalPriceCents ?? firstLease?.listPriceCents ?? contract.listPriceCents;
      const firstLeaseDate =
        asset.firstLeaseDate ?? recoveryFirstUseDate(input.today, inspection.ageMonths);
      const ageMonths = asset.firstLeaseDate
        ? recoveryAgeMonths(firstLeaseDate, input.today)
        : inspection.ageMonths;
      if (asset.firstLeaseDate && inspection.ageMonths !== ageMonths)
        throw new ApiError(409, 'AGE_CHANGED', 'The recorded item age has changed.');
      const category = assetCategorySchema.parse(asset.category);
      const findings = inspection.record && evaluateInspection(category, inspection.record);
      if (findings) {
        if (!findings.ok || findings.repairNetCents !== inspection.additionalRepairCents)
          throw new ApiError(400, 'INVALID_INSPECTION', 'The inspection record is incomplete.');
        if (!conditionsUpTo(findings.conditionCap).includes(inspection.condition))
          throw new ApiError(
            400,
            'CONDITION_ABOVE_FINDINGS',
            'The findings do not support this condition.'
          );
      }
      const financedCents = contract.listPriceCents - contract.downPaymentCents;
      const band = monthlyFactorFor(table, financedCents, contract.termMonths);
      if (!band.ok)
        throw new ApiError(
          409,
          'QUOTE_UNAVAILABLE',
          'The contract financing basis is unavailable.'
        );
      const annualRateBasisPoints =
        contract.annualRateBasisPoints ?? Math.round(band.band.annual_interest_percent * 100);
      const vatRate = vat.rates.find(
        (rate) =>
          rate.valid_from <= input.today && (rate.valid_to === null || rate.valid_to >= input.today)
      );
      if (!vatRate) throw new ApiError(409, 'QUOTE_UNAVAILABLE', 'No tax rate is available.');
      const vatBasisPoints = Math.round(vatRate.rate_percent * 100);
      const summary = summarizeLease(contract, vat.rates, input.today);
      if (!summary.forecast.ok)
        throw new ApiError(409, 'QUOTE_UNAVAILABLE', 'The contract schedule is unavailable.');
      const issuedDates = new Set(
        contract.invoices
          .filter((invoice) => invoice.status === 'issued')
          .map((invoice) => invoice.dueDate)
      );
      const unissued = summary.forecast.invoices.filter(
        (invoice) => !issuedDates.has(invoice.dueDate)
      );
      const remainingMonths = unissued.filter((invoice) => invoice.dueDate >= input.today).length;
      const accruedUnissuedCents = unissued
        .filter((invoice) => invoice.dueDate < input.today)
        .reduce((sum, invoice) => sum + invoice.totalCents, 0);
      // Damage logged as the customer's responsibility can exceed the cost of a grade drop, and can
      // exist with no grade drop at all. The larger amount applies; the two never add up.
      const damageNetCents = Math.max(
        conditionDamageCost(
          assetConditionSchema.parse(contract.startCondition ?? asset.condition),
          inspection.condition,
          costs[category]
        ),
        findings?.chargeableNetCents ?? 0
      );
      let quote;
      try {
        quote = quoteReturn(
          {
            category,
            originalPriceCents,
            ageMonths,
            maintenanceUsageValue: asset.maintenanceUsageValue,
          },
          {
            monthlyNetCents: contract.monthlyNetCents,
            buyoutCents: contract.buyoutCents,
            remainingMonths,
            annualRateBasisPoints,
            recoveryCents: 0,
            vatBasisPoints,
            outstandingCents: summary.outstandingCents + accruedUnissuedCents,
            termMonths: contract.termMonths,
          },
          {
            condition: inspection.condition,
            targetCondition: inspection.targetCondition,
            usageValue: inspection.usageValue,
            additionalRepairCents: inspection.additionalRepairCents,
            damageNetCents,
            skipBatteryTask: batteryIsRepairLine(inspection.record),
          },
          curves,
          costs
        );
      } catch (error) {
        if (error instanceof RangeError)
          throw new ApiError(
            400,
            'INVALID_INSPECTION',
            'The condition or recovery inputs are invalid.'
          );
        throw error;
      }
      const { recovery } = quote;
      // The price from the return form stands. The inspection only records the item and our costs.
      const agreed =
        request.kind !== 'buyout' && request.customerReportJson
          ? recoveryReportSchema.parse(JSON.parse(request.customerReportJson)).agreedPrice
          : undefined;
      const outstandingCents = summary.outstandingCents + accruedUnissuedCents;
      const settlement = agreed
        ? withAgreedReturnPrice(quote.settlement, agreed, outstandingCents)
        : quote.settlement;
      const snapshot = recoveryCalculationSchema.parse({
        quoteDate: input.today,
        originalPriceCents,
        firstLeaseDate,
        ageMonths,
        annualRateBasisPoints,
        rateSource:
          contract.annualRateBasisPoints === null
            ? 'legacy_coefficient_table'
            : 'contract_snapshot',
        vatBasisPoints: agreed?.vatBasisPoints ?? vatBasisPoints,
        outstandingInvoiceCents: summary.outstandingCents,
        accruedUnissuedCents,
        damageNetCents: agreed
          ? agreed.lines.reduce((sum, line) => sum + line.netCents, 0)
          : damageNetCents,
        chargeableDamage: agreed
          ? []
          : [
              ...(inspection.record?.checks ?? [])
                .filter((check) => check.chargeable !== false && check.repairCents > 0)
                .map((check) => ({
                  area: check.id,
                  type: 'repair',
                  netCents: check.repairCents,
                  checkId: check.id,
                })),
              ...(inspection.record?.damage ?? [])
                .filter((entry) => entry.liability === 'chargeable')
                .map((entry) => ({
                  area: entry.area,
                  type: entry.type,
                  netCents: entry.repairCents,
                })),
            ],
        ...(agreed ? { agreedLines: agreed.lines } : {}),
        recovery,
        settlement,
      });
      const data = {
        assessedBy: input.staffId,
        inspectionJson: JSON.stringify(inspection),
        calculationJson: JSON.stringify(snapshot),
        status: 'quoted',
      };
      const assessment = await tx.returnAssessment.upsert({
        where: { requestId: request.id },
        create: { requestId: request.id, ...data },
        update: data,
      });
      await tx.leaseRequest.update({ where: { id: request.id }, data: { status: 'approved' } });
      return assessment;
    }
  );
}

export async function acceptReturn(
  db: PrismaClient,
  input: {
    requestId: string;
    contractId: string;
    customerId: string;
    userId: string;
    today: string;
    action: 'accept' | 'buyout';
    expectedAssessmentUpdatedAt: string;
    /** Required to pay a demo return that costs something. Real leases have no payment service yet. */
    paymentMethod?: string;
  }
) {
  return withAudit(
    db,
    {
      actor: input.userId,
      action: input.action === 'buyout' ? 'lease.buyout_confirmed' : 'return.quote_accepted',
      entityType: 'lease_request',
      entityId: input.requestId,
    },
    async (tx) => {
      const request = await tx.leaseRequest.findFirst({
        where: {
          id: input.requestId,
          contractId: input.contractId,
          contract: { customerId: input.customerId },
        },
        include: { assessment: true, contract: true },
      });
      if (!request) throw new ApiError(404, 'NOT_FOUND', 'Request not found.');
      if (
        !request.assessment ||
        request.assessment.status !== 'quoted' ||
        request.contract.status !== 'active'
      )
        throw new ApiError(409, 'RETURN_STATE', 'No current quote is available.');
      if (request.assessment.updatedAt.toISOString() !== input.expectedAssessmentUpdatedAt)
        throw new ApiError(409, 'QUOTE_CHANGED', 'The quote has changed. Please review it again.');
      if (calculation(request.assessment.calculationJson).quoteDate !== input.today)
        throw new ApiError(409, 'QUOTE_EXPIRED', 'Ask for a new quote.');
      if (input.action === 'buyout') {
        if (request.kind !== 'buyout')
          throw new ApiError(409, 'RETURN_STATE', 'This is not a buyout request.');
        // A simulated checkout remains simulated; no real payment is inferred by accepting a quote.
        if (!request.contract.isDemo)
          throw new ApiError(
            409,
            'PAYMENT_REQUIRED',
            'Recorded settlement payment is required before transfer.'
          );
        await tx.contract.update({
          where: { id: request.contractId },
          data: { status: 'bought', endedOn: input.today },
        });
        await tx.asset.update({
          where: { id: request.contract.assetId },
          data: { status: 'sold' },
        });
        return tx.returnAssessment.update({
          where: { id: request.assessment.id },
          data: { status: 'bought' },
        });
      }
      if (!['return', 'exchange'].includes(request.kind))
        throw new ApiError(409, 'RETURN_STATE', 'This is not a return request.');
      const amountCents = calculation(request.assessment.calculationJson).settlement
        .returnTotalCents;
      if (amountCents > 0 && request.contract.isDemo) {
        if (!input.paymentMethod)
          throw new ApiError(400, 'PAYMENT_METHOD_REQUIRED', 'Choose a payment method.');
        await tx.leaseActionPayment.create({
          data: {
            contractId: input.contractId,
            // One assessment can be paid once, so a repeated request cannot charge twice.
            reference: `return-${request.assessment.id}`,
            kind: 'return',
            amountCents,
            paymentMethod: input.paymentMethod,
            quoteJson: request.assessment.calculationJson,
            isSimulated: true,
          },
        });
        const data = await leaseActionContext(tx, input.customerId, input.contractId, input.today);
        await settleOpenRent(tx, data, input.today);
      }
      return tx.returnAssessment.update({
        where: { id: request.assessment.id },
        data: { status: 'accepted' },
      });
    }
  );
}

export async function progressReturn(
  db: PrismaClient,
  input: {
    requestId: string;
    staffId: string;
    today: string;
    action: 'receive' | 'retire';
  }
) {
  return withAudit(
    db,
    {
      actor: input.staffId,
      action: `return.${input.action}`,
      entityType: 'lease_request',
      entityId: input.requestId,
    },
    async (tx) => {
      await staffInTransaction(tx, input.staffId);
      const request = await tx.leaseRequest.findFirst({
        where: { id: input.requestId, kind: { in: ['return', 'exchange'] } },
        include: includeCase,
      });
      if (!request?.assessment) throw new ApiError(404, 'NOT_FOUND', 'Assessed return not found.');
      const assessment = request.assessment;
      if (input.action === 'receive') {
        const snapshot = calculation(assessment.calculationJson);
        const inspection = inspectionSchema.parse(JSON.parse(assessment.inspectionJson));
        if (assessment.status !== 'accepted' || request.contract.status !== 'active')
          throw new ApiError(409, 'RETURN_STATE', 'The accepted return must be received once.');
        const otherActive = await tx.contract.count({
          where: {
            assetId: request.contract.assetId,
            status: 'active',
            id: { not: request.contractId },
          },
        });
        if (otherActive > 0)
          throw new ApiError(409, 'ASSET_IN_USE', 'This item has another active lease.');
        await tx.contract.update({
          where: { id: request.contractId },
          data: { status: 'returned', endedOn: input.today },
        });
        await tx.asset.update({
          where: { id: request.contract.assetId },
          data: {
            status: 'returned',
            usage_value: inspection.usageValue,
            condition: inspection.condition,
            originalPriceCents: snapshot.originalPriceCents,
            firstLeaseDate: snapshot.firstLeaseDate,
            previous_lives: { increment: 1 },
          },
        });
        await tx.leaseEvent.create({
          data: { contractId: request.contractId, kind: 'returned', eventDate: input.today },
        });
        // Nothing else stands between receiving an item and deciding on its relisting.
        return tx.returnAssessment.update({
          where: { id: assessment.id },
          data: { status: 'ready' },
        });
      }
      if (
        !['received', 'ready'].includes(assessment.status) ||
        request.contract.status !== 'returned'
      )
        throw new ApiError(409, 'RETURN_STATE', 'The item must be received before this action.');
      return tx.returnAssessment.update({
        where: { id: assessment.id },
        data: { status: 'retired' },
      });
    }
  );
}
