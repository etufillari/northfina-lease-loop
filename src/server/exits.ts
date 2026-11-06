// Leaving a contract: buy out, return or pass on, at the end of the term or early (D14, D16).
// `previewExit` plans on the request's day and writes nothing. `exitContract` plans the same
// way and writes it in one `withAudit`: the contract's status and end day through the contract
// slice's `endContract` (the row parsed, a conditional write on `active`, so a second exit finds
// nothing to change), then one event emitted on the same `tx`. The handlers do the other
// slices' parts: the invoices bill the exit and cancel the unpaid rents, the catalogue sets the
// asset `sold` or `returned` (D22), the passport writes its entry. A handler that throws
// rolls the whole exit back.
import { randomUUID } from 'node:crypto';
import type { AssetCondition, UsageUnit } from '@/data/schemas';
import {
  nextDealQuote,
  planExit,
  type ExitMode,
  type ExitRefusal,
  type PlannedExit,
} from '@/domain/exits';
import { allowedTermsOf, type PricingData, type QuoteRefusal } from '@/domain/pricing';
import type { AuthzRefusal } from '@/domain/authz/policy';
import { latestAuditDetails, withAudit } from './audit';
import { appendAssetEvent } from './asset-events';
import { relistReturnedAsset, reserveAvailableAsset } from './assets';
import { AssetNotLeasedError } from './catalogue-handlers';
import { authorize } from './authorize';
import { endContract, type ContractView } from './contracts';
import { getCustomer } from './customers';
import { emit } from './events';
import './event-handlers';
import {
  loadExitData,
  planInputOf,
  readExitContext,
  type ExitChoice,
  type ExitContext,
  type ExitData,
} from './exit-data';
import type { PrismaClient } from './prisma-client';
import { createQuoteInTx, loadPricingData, type CreateQuoteResult } from './quotes';

export type ExitServiceRefusal =
  | ExitRefusal
  | { code: 'contract_not_found'; params: { contractId: string } }
  | AuthzRefusal
  | { code: 'next_customer_not_found'; params: { customerId: string } }
  | { code: 'asset_not_leased'; params: { assetId: string } }
  | { code: 'next_quote_refused'; params: { reason: string } };

/** The plan as the API and the page see it (exit-schemas.ts `exitPreviewResponseSchema`). */
export type ExitPreview = {
  today: string;
  mode: ExitMode;
  reason: PlannedExit['reason'];
  atOrAfterEnd: boolean;
  status: PlannedExit['status'];
  monthsPaid: number;
  buy: PlannedExit['cost']['buy'];
  return: PlannedExit['cost']['return'];
  /** D90: the return without the refurbishment. */
  passOn: PlannedExit['cost']['passOn'];
  invoice: PlannedExit['invoice'];
  cancelInvoiceIds: string[];
};

export type PreviewExitResult =
  | { ok: true; preview: ExitPreview }
  | { ok: false; reason: Exclude<ExitServiceRefusal, AuthzRefusal> };

export type ExitContractResult =
  | { ok: true; contract: ContractView; plan: ExitPreview; nextQuoteId?: string }
  | { ok: false; reason: ExitServiceRefusal };

function toPreview(plan: PlannedExit, today: string): ExitPreview {
  return {
    today,
    mode: plan.mode,
    reason: plan.reason,
    atOrAfterEnd: plan.cost.atOrAfterEnd,
    status: plan.status,
    monthsPaid: plan.cost.monthsPaid,
    buy: plan.cost.buy,
    return: plan.cost.return,
    passOn: plan.cost.passOn,
    invoice: plan.invoice,
    cancelInvoiceIds: plan.cancelInvoiceIds,
  };
}

type Reported = { condition: AssetCondition; usage: { unit: UsageUnit; value: number } };

async function plan(
  db: PrismaClient,
  contractId: string,
  choice: Omit<ExitChoice, 'reported'> & { reported?: Reported; context?: ExitContext },
  data?: ExitData
) {
  const { context: known, ...rest } = choice;
  const context = known ?? (await readExitContext(db, contractId));
  if (!context) {
    return { ok: false, reason: { code: 'contract_not_found', params: { contractId } } } as const;
  }
  const reported = rest.reported ?? {
    condition: context.asset.condition,
    usage: context.asset.usage,
  };
  const input = planInputOf(context, data ?? (await loadExitData()), { ...rest, reported });
  return { ...planExit(input), context } as const;
}

/**
 * What an exit on `today` would do, without writing. The condition and usage default to the
 * catalogue's last known values; the route checks who may see it.
 */
export async function previewExit(
  db: PrismaClient,
  /** `context`: the rows the caller has already read, so they are not read twice. */
  input: { contractId: string; mode: ExitMode; reported?: Reported; context?: ExitContext },
  today: string,
  data?: ExitData
): Promise<PreviewExitResult> {
  const planned = await plan(db, input.contractId, { ...input, today }, data);
  if (!planned.ok) return { ok: false, reason: planned.reason };
  return { ok: true, preview: toPreview(planned.plan, today) };
}

export type ExitContractInput = {
  contractId: string;
  mode: ExitMode;
  reason?: string;
  reported: Reported;
  nextCustomerId?: string;
  actor: string;
};

/** Thrown inside the transaction when another exit changed the contract first. */
class LostExitRace extends Error {}

/** D90: thrown inside the transaction when the next customer's quote cannot be priced. */
class NextQuoteRefused extends Error {
  constructor(readonly reason: string) {
    super(`The next quote was refused: ${reason}`);
  }
}

type Refused = Extract<CreateQuoteResult, { ok: false }>['reason'] | QuoteRefusal;

/** Leaves the contract on `today`: authorized first (D73), its customer or `admin`. One audited transaction. */
export async function exitContract(
  db: PrismaClient,
  input: ExitContractInput,
  today: string,
  data?: ExitData,
  /** D90: the pricing the next customer's quote uses; the data pack's when not given. */
  pricing?: PricingData
): Promise<ExitContractResult> {
  const { contractId, actor } = input;
  const notFound = {
    ok: false,
    reason: { code: 'contract_not_found', params: { contractId } },
  } as const;
  const auth = await authorize(db, actor, 'exit_contract', { contract: contractId });
  if (!auth.ok)
    return auth.reason.code === 'not_found' ? notFound : { ok: false, reason: auth.reason };
  const context = await readExitContext(db, contractId);
  if (!context) return notFound;
  if (input.nextCustomerId && !(await getCustomer(db, input.nextCustomerId))) {
    return {
      ok: false,
      reason: { code: 'next_customer_not_found', params: { customerId: input.nextCustomerId } },
    };
  }

  const planned = await plan(db, contractId, { ...input, today, context }, data);
  if (!planned.ok) return { ok: false, reason: planned.reason };
  const exit = planned.plan;
  const notActive = {
    ok: false,
    reason: { code: 'contract_not_active', params: { status: exit.status } },
  } as const;
  // D90: a pass-on starts the next deal in the same transaction (src/domain/exits/next-deal.ts).
  const nextQuoteId = exit.mode === 'pass_on' ? randomUUID() : undefined;
  const nextPricing = nextQuoteId ? (pricing ?? (await loadPricingData())) : undefined;

  try {
    const row = await withAudit(
      db,
      {
        actor,
        action: `contract.${exit.mode === 'buy' ? 'bought_out' : exit.mode === 'return' ? 'returned' : 'passed_on'}`,
        entityType: 'contract',
        entityId: contractId,
        details: {
          mode: exit.mode,
          reason: exit.reason,
          status: exit.status,
          endedOn: exit.endedOn,
          invoice: exit.invoice,
          cancelledRents: exit.cancelInvoiceIds.length,
          nextCustomerId: input.nextCustomerId ?? null,
          nextQuoteId: nextQuoteId ?? null,
        },
      },
      async (tx) => {
        // The contract slice's operation: the row parsed (D27), written only while active.
        const ended = await endContract(tx, {
          id: contractId,
          status: exit.status,
          endedOn: exit.endedOn,
        });
        if (!ended) throw new LostExitRace();
        await emit(tx, exit.event);
        if (nextQuoteId && nextPricing && input.nextCustomerId) {
          await startNextDeal(tx, {
            quoteId: nextQuoteId,
            customerId: input.nextCustomerId,
            contractId,
            assetId: context.asset.id,
            reported: input.reported,
            marketValueCents: exit.cost.marketValue.valueCents,
            pricing: nextPricing,
            today,
          });
        }
        return ended;
      }
    );
    return {
      ok: true,
      contract: row,
      plan: toPreview(exit, today),
      ...(nextQuoteId ? { nextQuoteId } : {}),
    };
  } catch (error) {
    if (error instanceof LostExitRace) {
      const now = await readExitContext(db, contractId);
      return {
        ...notActive,
        reason: { ...notActive.reason, params: { status: now?.contract.status ?? exit.status } },
      };
    }
    // Product review 4: the asset is no longer out on this lease (moved by another request);
    // the catalogue handler refused the exit's status write and the whole exit rolled back.
    if (error instanceof NextQuoteRefused) {
      return {
        ok: false,
        reason: { code: 'next_quote_refused', params: { reason: error.reason } },
      };
    }
    if (error instanceof AssetNotLeasedError) {
      return {
        ok: false,
        reason: { code: 'asset_not_leased', params: { assetId: error.assetId } },
      };
    }
    throw error;
  }
}

/** D90: the quote a pass-on started for the next customer, read from its audit entry; or null. */
export async function nextQuoteIdOf(db: PrismaClient, contractId: string): Promise<string | null> {
  const details = await latestAuditDetails(db, {
    action: 'contract.passed_on',
    entityType: 'contract',
    entityId: contractId,
  });
  const id = (details as { nextQuoteId?: unknown } | null)?.nextQuoteId;
  return typeof id === 'string' ? id : null;
}

/**
 * D90: the item goes straight from hand to hand. On the exit's `tx`, after the catalogue set it
 * `returned`, the assets slice relists it as reported (no refurbishment: none was charged, and
 * planExit refused anything below `good`), the quote slice stores the next customer's quote
 * priced from the market value on the exit day and named for them, the passport writes
 * `repriced` with that value (as the second-life path does), and the item is `reserved` for them
 * so it is not in the public catalogue. A refused quote throws, so the whole exit rolls back.
 */
async function startNextDeal(
  tx: Parameters<typeof relistReturnedAsset>[0],
  input: {
    quoteId: string;
    customerId: string;
    contractId: string;
    assetId: string;
    reported: Reported;
    marketValueCents: number;
    pricing: PricingData;
    today: string;
  }
): Promise<void> {
  await relistReturnedAsset(tx, {
    assetId: input.assetId,
    condition: input.reported.condition,
    usageValue: input.reported.usage.value,
  });
  const deal = nextDealQuote({
    assetId: input.assetId,
    marketValueCents: input.marketValueCents,
    allowedTerms: allowedTermsOf(input.pricing, input.assetId),
    today: input.today,
  });
  const quote = await createQuoteInTx(
    tx,
    { id: input.quoteId, customerId: input.customerId, ...deal },
    input.pricing
  );
  if (!quote.ok) throw new NextQuoteRefused((quote.reason as Refused).code);
  await appendAssetEvent(tx, {
    assetId: input.assetId,
    contractId: input.contractId,
    onDate: input.today,
    kind: 'repriced',
    details: {
      marketValueCents: input.marketValueCents,
      secondLifeFinancedCents: quote.quote.breakdown.financedCents,
      nextQuoteId: input.quoteId,
    },
  });
  await reserveAvailableAsset(tx, input.assetId);
}
