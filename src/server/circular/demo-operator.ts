import { ApiError } from '@/server/api-response';
import { companyModeRequest } from '@/server/company-mode';

export function demoCompanyOperator(request: Request): { actorId: string } {
  if (process.env.NODE_ENV !== 'development') throw new ApiError(404, 'NOT_FOUND', 'Not found');
  if (!companyModeRequest(request))
    throw new ApiError(403, 'FORBIDDEN', 'Enter company operations first');
  const target = new URL(request.url);
  target.host = request.headers.get('host') ?? target.host;
  if (request.headers.get('origin') !== target.origin) {
    throw new ApiError(403, 'FORBIDDEN', 'Same-origin request required');
  }
  return { actorId: 'demo:company-operator' };
}
