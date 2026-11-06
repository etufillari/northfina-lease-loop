import { z } from 'zod';
import {
  loadRefurbishmentCosts,
  loadCoefficientTable,
  loadPriceLists,
  loadVatRates,
} from '@/data/load';
import { checkoutQuote } from '@/domain/checkout-quote';
import { assetOfferPrice } from '@/domain/asset-offer';
import { todayIso } from './today';
import { conditionReport } from '@/domain/condition-report';
import { returnPreview } from '@/domain/return-preview';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { assetCategorySchema, assetConditionSchema, usageUnitSchema } from '@/data/schemas';
import { canRequestLeaseChange, type RequestKind } from '@/domain/lease-insights';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import { leaseActionContext } from './lease-actions';
import {
  recoveryReportSchema,
  reportIssuesByCategory,
  type RecoveryReport,
} from './recovery-input';

const contractStatus = z.enum(['awaiting_signature', 'active', 'completed', 'returned', 'bought']);
const requestStatus = z.enum(['pending', 'approved', 'rejected', 'cancelled']);
const requestKind = z.enum(['return', 'buyout', 'exchange']);
const eventKind = z.enum(['signed', 'payment', 'returned', 'refurbished']);

const include = {
  asset: {
    select: {
      id: true,
      category: true,
      make: true,
      model: true,
      model_year: true,
      condition: true,
      usage_unit: true,
      usage_value: true,
      previous_lives: true,
      serial_number: true,
    },
  },
  invoices: { include: { payments: true }, orderBy: { dueDate: 'asc' as const } },
  requests: {
    include: {
      assessment: { select: { id: true, status: true, calculationJson: true, updatedAt: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  events: { orderBy: { eventDate: 'desc' as const } },
  coLeaseShares: { include: { user: { select: { id: true, name: true } } } },
  actionPayments: { select: { kind: true } },
};

export async function listCustomerLeases(db: PrismaClient, customerId: string) {
  const contracts = await db.contract.findMany({
    where: { customerId },
    include,
    orderBy: { createdAt: 'desc' },
  });
  return contracts.map(validateLease);
}

export type CustomerLease = Awaited<ReturnType<typeof listCustomerLeases>>[number];

export async function findCustomerLease(db: PrismaClient, customerId: string, contractId: string) {
  const contract = await db.contract.findFirst({ where: { id: contractId, customerId }, include });
  return contract ? validateLease(contract) : null;
}

function validateLease(contract: Prisma.ContractGetPayload<{ include: typeof include }>) {
  return {
    ...contract,
    status: contractStatus.parse(contract.status),
    asset: {
      ...contract.asset,
      category: assetCategorySchema.parse(contract.asset.category),
      condition: assetConditionSchema.parse(contract.asset.condition),
      usage_unit: usageUnitSchema.parse(contract.asset.usage_unit),
    },
    requests: contract.requests.map((request) => ({
      ...request,
      status: requestStatus.parse(request.status),
      kind: requestKind.parse(request.kind),
    })),
    events: contract.events.map((event) => ({ ...event, kind: eventKind.parse(event.kind) })),
  };
}

/** Ownership and eligibility are checked again within the same audited transaction. */
export async function requestLeaseChange(
  db: PrismaClient,
  input: {
    customerId: string;
    userId: string;
    contractId: string;
    kind: RequestKind;
    report?: RecoveryReport;
    /** The app's "today" (demo date in demo mode); the real Helsinki date when omitted. */
    today?: string;
  }
) {
  const today = input.today ?? todayIso();
  const market =
    input.kind === 'exchange'
      ? await Promise.all([loadCoefficientTable(), loadPriceLists(), loadVatRates()])
      : null;
  if (input.kind === 'exchange' && !input.report?.replacement)
    throw new ApiError(400, 'MISSING_REPLACEMENT', 'Choose a replacement.');
  const costs = input.report?.answers ? await loadRefurbishmentCosts() : null;
  return withAudit(
    db,
    {
      actor: input.userId,
      action: 'lease.requested',
      entityType: 'contract',
      entityId: input.contractId,
      details: { kind: input.kind },
    },
    async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: input.contractId, customerId: input.customerId },
        include: {
          asset: { select: { category: true, usage_value: true, condition: true } },
          requests: {
            where: {
              OR: [
                { status: 'pending' },
                { assessment: { status: { in: ['quoted', 'accepted', 'received', 'ready'] } } },
              ],
            },
          },
        },
      });
      if (!contract) throw new ApiError(404, 'NOT_FOUND', 'Lease not found.');
      const allowed = canRequestLeaseChange(
        contractStatus.parse(contract.status),
        contract.requests.length
      );
      if (allowed !== 'allowed')
        throw new ApiError(409, 'REQUEST_UNAVAILABLE', 'This request is unavailable.');
      if (!contract.startCondition)
        await tx.contract.update({
          where: { id: contract.id },
          data: {
            startCondition: contract.asset.condition,
            startUsageValue: contract.asset.usage_value,
          },
        });
      let report = input.report ? recoveryReportSchema.parse(input.report) : undefined;
      if (report?.answers && costs) {
        const derived = conditionReport(
          assetCategorySchema.parse(contract.asset.category),
          assetConditionSchema.parse(contract.startCondition ?? contract.asset.condition),
          report.answers,
          costs
        );
        report = { ...report, condition: derived.condition, issues: derived.issues };
      }
      if (input.kind === 'exchange' && report?.replacement) {
        const replacement = await tx.asset.findUnique({
          where: { id: report.replacement.id },
          include: { contracts: { where: { status: 'active' }, select: { id: true } } },
        });
        if (
          !replacement ||
          replacement.status !== 'available' ||
          replacement.contracts.length ||
          replacement.id === contract.assetId
        )
          throw new ApiError(409, 'REPLACEMENT_UNAVAILABLE', 'The replacement is unavailable.');
        const price = assetOfferPrice(replacement, market![1], today);
        const quote = price.ok
          ? checkoutQuote(
              price.priceCents,
              report.replacement.downPaymentCents,
              report.replacement.termMonths,
              today,
              market![0],
              market![2].rates
            )
          : null;
        if (!quote)
          throw new ApiError(409, 'QUOTE_UNAVAILABLE', 'The replacement cannot be financed.');
        report = {
          ...report,
          replacementQuote: {
            name: `${replacement.make} ${replacement.model}`,
            monthlyTotalCents: quote.monthlyTotalCents,
            totalCents: quote.totalCents,
            termMonths: report.replacement.termMonths,
            quoteDate: today,
          },
        };
      }
      if (report) {
        const allowedIssues =
          reportIssuesByCategory[assetCategorySchema.parse(contract.asset.category)];
        if (
          report.usageValue < contract.asset.usage_value ||
          report.issues.some((issue) => !(allowedIssues as readonly string[]).includes(issue))
        )
          throw new ApiError(400, 'INVALID_REPORT', 'The reported usage or issues are invalid.');
        // Never trust a price from the client: recalculate what the form showed and keep that.
        const { agreedPrice: _ignored, ...reported } = report;
        report = reported;
        if (report.answers && input.kind !== 'buyout') {
          const context = await leaseActionContext(tx, input.customerId, contract.id, today);
          let preview;
          try {
            preview = returnPreview(context, report.answers, report.usageValue);
          } catch (error) {
            if (error instanceof RangeError)
              throw new ApiError(400, 'INVALID_REPORT', 'The reported answers are invalid.');
            throw error;
          }
          report = {
            ...report,
            agreedPrice: {
              ...preview.agreedPrice,
              lines: preview.lines.map(({ id, netCents }) => ({ id, netCents })),
            },
          };
        }
      }
      return tx.leaseRequest.create({
        data: {
          contractId: contract.id,
          kind: input.kind,
          ...(report ? { customerReportJson: JSON.stringify(report) } : {}),
        },
      });
    }
  );
}
