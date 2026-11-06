// GET /api/audit-log/verify: walk the audit hash chain (docs/features/audit-chain.md).
// Read-only, so open to every actor, like the audit log itself.
import { handleRoute, ok } from '@/server/api-response';
import { verifyAuditChain } from '@/server/audit';
import { db } from '@/server/db';

export const GET = handleRoute(async () => ok(await verifyAuditChain(db)));
