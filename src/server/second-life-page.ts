// What the second-life page reads (D85: back office, admin only). Authorized before anything is
// read: the page shows the whole waiting list (second-life-demand.json: other customers'
// budgets, minimum condition, deadlines and descriptions), so a customer, anonymous or an
// unknown actor gets the refusal and nothing else, whichever item they ask for.
import type { Asset, SecondLifeRequest } from '@/data/schemas';
import type { AuthzRefusal } from '@/domain/authz/policy';
import { getAsset } from './assets';
import { authorize } from './authorize';
import type { PrismaClient } from './prisma-client';
import {
  latestAssessment,
  loadSecondLifeData,
  previewAssessment,
  type AssessmentView,
  type SecondLifeData,
} from './second-life';

export type SecondLifePageRead =
  | { ok: false; reason: AuthzRefusal }
  | {
      ok: true;
      /** Null for an unknown id (the page's 404). */
      asset: Asset | null;
      stored: AssessmentView | null;
      /** Today's preview while the item is `returned`, else null. */
      preview: Awaited<ReturnType<typeof previewAssessment>> | null;
      demand: readonly SecondLifeRequest[];
    };

export async function readSecondLifePage(
  db: PrismaClient,
  actor: string,
  assetId: string,
  today: string,
  data?: SecondLifeData
): Promise<SecondLifePageRead> {
  const auth = await authorize(db, actor, 'read_second_life', { none: true });
  // `{ none: true }` never resolves to not_found; anything that is not ok is a refusal.
  if (!auth.ok) {
    if (auth.reason.code === 'not_found') throw new Error('unreachable: no subject to find');
    return { ok: false, reason: auth.reason };
  }
  const [asset, stored, loaded] = await Promise.all([
    getAsset(db, assetId),
    latestAssessment(db, assetId),
    data ?? loadSecondLifeData(),
  ]);
  const preview =
    asset?.status === 'returned' ? await previewAssessment(db, assetId, today, loaded) : null;
  return { ok: true, asset, stored, preview, demand: loaded.demand };
}
