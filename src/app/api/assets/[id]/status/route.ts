import { fail, handleRoute } from '@/server/api-response';

// The starter's unrestricted status setter would bypass signing, returns and inspection.
export const PATCH = handleRoute(async () =>
  fail(409, 'STATUS_ROUTE_RETIRED', 'Use the lease lifecycle actions to change an item status')
);
