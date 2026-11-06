import { randomUUID } from 'node:crypto';
import type {
  Asset as AssetRow,
  SecondLifeMatch as SecondLifeMatchRow,
} from '@/generated/prisma/client';
import { isoDateSchema, type Asset, type SecondLifeRequest } from '@/data/schemas';
import {
  loadCoefficientTable,
  loadResidualCurves,
  loadSecondLifeDemand,
  loadPriceLists,
} from '@/data/load';
import {
  secondLifeMatchesFor,
  type MatchCandidate,
  type MatchPricing,
  type SecondLifeMatchResult,
} from '@/domain/second-life/second-life-matching';
import { withAudit, type TransactionClient } from '../audit';
import { toAsset } from '../assets/assets';
import type { PrismaClient } from '../prisma-client';
import { z } from 'zod';

export const secondLifePreviewRequestSchema = z.strictObject({
  availableOn: isoDateSchema,
});
export type SecondLifePreviewRequest = z.infer<typeof secondLifePreviewRequestSchema>;

export const secondLifeAcceptanceRequestSchema = z.strictObject({
  requestId: z.string().min(1),
  availableOn: isoDateSchema,
  actor: z.string().trim().min(1).max(100),
});
export type SecondLifeAcceptanceRequest = z.infer<typeof secondLifeAcceptanceRequestSchema>;

export type SecondLifeServiceFailure =
  | { ok: false; reason: 'asset_not_found' }
  | { ok: false; reason: 'asset_not_available'; status: string }
  | { ok: false; reason: 'request_not_found'; requestId: string }
  | { ok: false; reason: 'request_already_matched'; requestId: string; matchId: string }
  | { ok: false; reason: 'request_not_eligible'; requestId: string; reasons: string[] }
  | { ok: false; reason: 'asset_snapshot_changed'; status: string }
  | Extract<SecondLifeMatchResult, { ok: false }>;

export type SecondLifePreview = {
  asset: Asset;
  metadata: Extract<SecondLifeMatchResult, { ok: true }>['metadata'];
  candidates: MatchCandidate[];
  matches: Array<MatchCandidate & { pricing: MatchPricing }>;
};

export type SecondLifePreviewResult =
  { ok: true; preview: SecondLifePreview } | SecondLifeServiceFailure;

export type AcceptedSecondLifeMatch = {
  id: string;
  assetId: string;
  requestId: string;
  status: 'accepted';
  matchedOn: string;
  actor: string;
  pricing: MatchPricing;
  request: SecondLifeRequest;
};

export type SecondLifeAcceptanceResult =
  { ok: true; asset: Asset; match: AcceptedSecondLifeMatch } | SecondLifeServiceFailure;

class SecondLifeTransactionFailure extends Error {
  constructor(readonly failure: SecondLifeServiceFailure) {
    super('The asset or waiting-list request changed while accepting the match');
    this.name = 'SecondLifeTransactionFailure';
  }
}

function snapshotFailure(row: AssetRow | null): SecondLifeServiceFailure {
  return row
    ? { ok: false, reason: 'asset_snapshot_changed', status: row.status }
    : { ok: false, reason: 'asset_not_found' };
}

async function findAsset(db: PrismaClient | TransactionClient, assetId: string) {
  return db.asset.findUnique({ where: { id: assetId } });
}

async function loadMatchingData() {
  const [demand, priceLists, curves, coefficientTable] = await Promise.all([
    loadSecondLifeDemand(),
    loadPriceLists(),
    loadResidualCurves(),
    loadCoefficientTable(),
  ]);
  return { demand, priceLists, curves, coefficientTable };
}

async function claimedRequestIds(db: PrismaClient | TransactionClient): Promise<Set<string>> {
  const rows = await db.secondLifeMatch.findMany({ select: { request_id: true } });
  return new Set(rows.map((row) => row.request_id));
}

function filterUnclaimed(
  demand: readonly SecondLifeRequest[],
  claimed: ReadonlySet<string>,
  selectedRequestId?: string
): SecondLifeRequest[] {
  return demand.filter((request) => !claimed.has(request.id) || request.id === selectedRequestId);
}

function matchForRequest(
  asset: Asset,
  request: SecondLifeRequest,
  availableOn: string,
  data: Awaited<ReturnType<typeof loadMatchingData>>
): Extract<SecondLifeMatchResult, { ok: true }> | SecondLifeServiceFailure {
  const result = secondLifeMatchesFor(
    asset,
    [request],
    data.priceLists,
    data.curves,
    data.coefficientTable,
    availableOn
  );
  if (!result.ok) return result;
  return result;
}

function toPreview(
  row: AssetRow,
  result: Extract<SecondLifeMatchResult, { ok: true }>
): SecondLifePreview {
  return {
    asset: toAsset(row),
    metadata: result.metadata,
    candidates: result.candidates,
    matches: result.matches,
  };
}

function toAcceptedMatch(row: SecondLifeMatchRow): AcceptedSecondLifeMatch {
  return {
    id: row.id,
    assetId: row.asset_id,
    requestId: row.request_id,
    status: 'accepted',
    matchedOn: row.matched_on,
    actor: row.actor,
    pricing: JSON.parse(row.pricing_snapshot_json) as MatchPricing,
    request: JSON.parse(row.request_snapshot_json) as SecondLifeRequest,
  };
}

/** Calculates ranked matches without changing assets, matches, or audit data. */
export async function previewSecondLifeMatches(
  db: PrismaClient,
  assetId: string,
  input: SecondLifePreviewRequest
): Promise<SecondLifePreviewResult> {
  const row = await findAsset(db, assetId);
  if (!row) return { ok: false, reason: 'asset_not_found' };

  const data = await loadMatchingData();
  const claimed = await claimedRequestIds(db);
  const result = secondLifeMatchesFor(
    toAsset(row),
    filterUnclaimed(data.demand, claimed),
    data.priceLists,
    data.curves,
    data.coefficientTable,
    input.availableOn
  );
  if (!result.ok) return result;
  return { ok: true, preview: toPreview(row, result) };
}

/** Accepts one ranked match, reserves the asset, and records the match atomically. */
export async function acceptSecondLifeMatch(
  db: PrismaClient,
  assetId: string,
  input: SecondLifeAcceptanceRequest
): Promise<SecondLifeAcceptanceResult> {
  const [row, request, existingMatch, data] = await Promise.all([
    findAsset(db, assetId),
    loadSecondLifeDemand().then((demand) =>
      demand.find((candidate) => candidate.id === input.requestId)
    ),
    db.secondLifeMatch.findUnique({ where: { request_id: input.requestId } }),
    loadMatchingData(),
  ]);
  if (!row) return { ok: false, reason: 'asset_not_found' };
  if (!request) return { ok: false, reason: 'request_not_found', requestId: input.requestId };
  if (existingMatch) {
    return {
      ok: false,
      reason: 'request_already_matched',
      requestId: input.requestId,
      matchId: existingMatch.id,
    };
  }

  const initial = matchForRequest(toAsset(row), request, input.availableOn, data);
  if (!initial.ok) return initial;
  const initialCandidate = initial.matches[0];
  if (!initialCandidate) {
    const candidate = initial.candidates[0];
    return {
      ok: false,
      reason: 'request_not_eligible',
      requestId: input.requestId,
      reasons: candidate?.reasons ?? ['not_eligible'],
    };
  }

  const matchId = randomUUID();
  try {
    const result = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.second_life_matched',
        entityType: 'asset',
        entityId: assetId,
        details: {
          matchId,
          requestId: input.requestId,
          matchedOn: input.availableOn,
          monthlyNetRentCents: initialCandidate.pricing.monthlyNetRentCents,
        },
      },
      async (tx) => {
        const current = await findAsset(tx, assetId);
        if (!current || current.status !== 'available') {
          throw new SecondLifeTransactionFailure(snapshotFailure(current));
        }
        const claimed = await tx.secondLifeMatch.findUnique({
          where: { request_id: input.requestId },
        });
        if (claimed) {
          throw new SecondLifeTransactionFailure({
            ok: false,
            reason: 'request_already_matched',
            requestId: input.requestId,
            matchId: claimed.id,
          });
        }

        const currentResult = matchForRequest(toAsset(current), request, input.availableOn, data);
        if (!currentResult.ok) throw new SecondLifeTransactionFailure(currentResult);
        const currentCandidate = currentResult.matches[0];
        if (!currentCandidate) {
          const candidate = currentResult.candidates[0];
          throw new SecondLifeTransactionFailure({
            ok: false,
            reason: 'request_not_eligible',
            requestId: input.requestId,
            reasons: candidate?.reasons ?? ['not_eligible'],
          });
        }

        const reserved = await tx.asset.updateMany({
          where: { id: assetId, status: 'available' },
          data: {
            status: 'reserved',
            first_leased_on: current.first_leased_on ?? currentResult.metadata.firstLeasedOn,
            original_list_price_cents:
              current.original_list_price_cents ?? currentResult.metadata.originalListPriceCents,
          },
        });
        if (reserved.count !== 1) {
          const latest = await findAsset(tx, assetId);
          throw new SecondLifeTransactionFailure(snapshotFailure(latest));
        }

        const created = await tx.secondLifeMatch.create({
          data: {
            id: matchId,
            asset_id: assetId,
            request_id: input.requestId,
            status: 'accepted',
            matched_on: input.availableOn,
            actor: input.actor,
            market_value_cents: currentCandidate.pricing.marketValueCents,
            term_months: currentCandidate.pricing.termMonths,
            monthly_net_rent_cents: currentCandidate.pricing.monthlyNetRentCents,
            pricing_snapshot_json: JSON.stringify(currentCandidate.pricing),
            request_snapshot_json: JSON.stringify(request),
          },
        });
        await tx.assetHistory.create({
          data: {
            asset_id: assetId,
            event_type: 'matched',
            occurred_on: input.availableOn,
            from_status: 'available',
            to_status: 'reserved',
            condition: current.condition,
            usage_unit: current.usage_unit,
            usage_value: current.usage_value,
            actor: input.actor,
            details_json: JSON.stringify({
              matchId,
              requestId: input.requestId,
              monthlyNetRentCents: currentCandidate.pricing.monthlyNetRentCents,
            }),
          },
        });
        return { asset: await findAsset(tx, assetId), match: created };
      }
    );

    if (!result.asset) throw new Error(`Asset ${assetId} disappeared after matching`);
    return {
      ok: true,
      asset: toAsset(result.asset),
      match: toAcceptedMatch(result.match),
    };
  } catch (error) {
    if (error instanceof SecondLifeTransactionFailure) return error.failure;
    throw error;
  }
}
