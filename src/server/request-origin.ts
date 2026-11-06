import { ApiError } from './api-response';
/** Only the explicitly configured development tunnel may upgrade its expected origin to HTTPS. */
export function requireSameOrigin(request: Request) {
  const internal = new URL(request.url);
  const target = new URL(`${internal.protocol}//${request.headers.get('host') ?? internal.host}`);
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.LEASE_LOOP_DEMO_HOST &&
    target.host === process.env.LEASE_LOOP_DEMO_HOST
  )
    target.protocol = 'https:';
  if (request.headers.get('origin') !== target.origin)
    throw new ApiError(403, 'FORBIDDEN', 'Same-origin request required');
}
