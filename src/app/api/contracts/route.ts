// POST /api/contracts
// body: { applicationId, signedOn, actor }
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { contractCreationRequestSchema, createContract } from '@/server/contracts';
import { throwContractError } from '@/server/contract-errors';

export const POST = handleRoute(async (request) => {
  const input = await readJsonBody(request, contractCreationRequestSchema);
  const result = await createContract(db, input);
  if (!result.ok) throwContractError(result);
  return ok({ contract: result.contract }, { status: 201 });
});
