// POST /api/demo/persona: sign in as a data-pack persona (demo mode only).
import { handleRoute } from '@/server/api-response';
import { db } from '@/server/db';
import { switchPersona } from '@/server/demo-actions';

export const POST = handleRoute((request) => switchPersona(db, request));
