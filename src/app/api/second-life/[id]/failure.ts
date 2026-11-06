// One mapping from second-life failure reasons to API errors, shared by the preview and
// execute routes.
import { fail } from '@/server/api-response';
import type { SecondLifeFailure } from '@/server/second-life';

export function secondLifeFailure(reason: SecondLifeFailure, id: string): Response {
  if (reason === 'not_found') return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);
  if (reason === 'not_returned') {
    return fail(409, 'ASSET_NOT_RETURNED', 'Only a returned asset can go through the desk');
  }
  if (reason === 'nominated') {
    return fail(409, 'ASSET_NOMINATED', 'This item is held for a nominated successor');
  }
  return fail(422, 'NO_ORIGINAL_PRICE', 'This asset has no price in price list v1');
}
