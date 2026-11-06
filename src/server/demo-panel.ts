// Read-only data for the demo panel (D-058): items by status, contracts, open quotes and the size of
// the audit log. Nothing here writes, so nothing goes through withAudit.
import { assetStatusSchema, type AssetStatus } from '@/data/schemas';
import type { ScenarioTarget } from '@/domain/demo-scenarios';
import type { PrismaClient } from './prisma-client';
import { parseStoredValue } from './stored-row';

export interface DemoPanelAsset {
  id: string;
  make: string;
  model: string;
  status: AssetStatus;
}

export interface DemoPanelContract {
  id: number;
  assetId: string;
  customerId: string;
  /** `active`, or `awaiting_signatory` while the person who must sign hasn't (D-053). */
  status: string;
  startDate: string;
  /** True once the contract has an ending (end of term or early exit). */
  ended: boolean;
}

export interface DemoPanelData {
  assets: DemoPanelAsset[];
  /** Newest first. */
  contracts: DemoPanelContract[];
  /** Quotes not yet signed, newest first. */
  openQuotes: { id: number; assetId: string }[];
  auditCount: number;
}

export async function loadDemoPanel(db: PrismaClient): Promise<DemoPanelData> {
  const [assets, contracts, endings, quotes, auditCount] = await Promise.all([
    db.asset.findMany({
      select: { id: true, make: true, model: true, status: true },
      orderBy: { id: 'asc' },
    }),
    db.contract.findMany({
      select: { id: true, asset_id: true, customer_id: true, status: true, start_date: true },
      orderBy: { id: 'desc' },
    }),
    db.contractEnding.findMany({ select: { contract_id: true } }),
    db.quote.findMany({
      where: { contract_id: null },
      select: { id: true, asset_id: true },
      orderBy: { id: 'desc' },
    }),
    db.auditLog.count(),
  ]);
  const ended = new Set(endings.map((e) => e.contract_id));
  return {
    // A status outside the schema is a corrupt row: a 500, like toAsset (D-038).
    assets: assets.map((a) => ({
      ...a,
      status: parseStoredValue(assetStatusSchema, a.status, { table: 'Asset', id: a.id }),
    })),
    contracts: contracts.map((c) => ({
      id: c.id,
      assetId: c.asset_id,
      customerId: c.customer_id,
      status: c.status,
      startDate: c.start_date,
      ended: ended.has(c.id),
    })),
    openQuotes: quotes.map((q) => ({ id: q.id, assetId: q.asset_id })),
    auditCount,
  };
}

/**
 * The record a scenario step opens when it lives in the database: the newest matching contract that
 * hasn't ended, or the newest unsigned quote. Null when there is none yet (the page says which card
 * to run first), and for targets the page links to by item id.
 */
export function resolveScenarioTarget(
  panel: DemoPanelData,
  target: ScenarioTarget
): { kind: 'contract' | 'quote'; id: number } | null {
  if (target.kind === 'contract') {
    const match = panel.contracts.find(
      (c) =>
        !c.ended &&
        c.assetId === target.assetId &&
        c.status === target.status &&
        (target.customerId === undefined || c.customerId === target.customerId)
    );
    return match ? { kind: 'contract', id: match.id } : null;
  }
  if (target.kind === 'open_quote') {
    const match = panel.openQuotes.find((q) => q.assetId === target.assetId);
    return match ? { kind: 'quote', id: match.id } : null;
  }
  return null;
}
