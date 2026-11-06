// POST /api/demo/date: set or clear the demo date (demo mode only).
import { handleRoute } from '@/server/api-response';
import { db } from '@/server/db';
import { setDemoDate } from '@/server/demo-actions';

export const POST = handleRoute((request) => setDemoDate(db, request));
