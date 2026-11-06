// GET /api/staff/queue — applications waiting for a person: manual reviews and
// company applications waiting for their signatory, oldest first.
import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { listStaffQueue } from '@/server/staff';

export const GET = handleRoute(async () => ok(await listStaffQueue(db)));
