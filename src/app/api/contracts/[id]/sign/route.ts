// POST /api/contracts/:id/sign: the company's named signatory signs (scenario card 6).
import { handleRoute } from '@/server/api-response';
import { signAsSignatory } from '@/server/contract-signing';
import { db } from '@/server/db';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/sign'>) =>
    signAsSignatory(db, request, (await params).id)
);
