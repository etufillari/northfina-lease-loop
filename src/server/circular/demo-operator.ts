import { requireSameOrigin } from '@/server/request-origin';
import { companyModeRequest } from '@/server/company-mode';
import { ApiError } from '@/server/api-response';
import { OPERATOR_COOKIE, validOperatorSession } from './operator-session';

export function demoCompanyOperator(request: Request): { actorId: string } {
  if (process.env.NODE_ENV !== 'development') throw new ApiError(404, 'NOT_FOUND', 'Not found');
  if (!companyModeRequest(request))
    throw new ApiError(403, 'FORBIDDEN', 'Company workspace required');
  if (!['GET', 'HEAD'].includes(request.method)) requireSameOrigin(request);
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OPERATOR_COOKIE}=`))
    ?.slice(OPERATOR_COOKIE.length + 1);
  if (!validOperatorSession(token))
    throw new ApiError(403, 'FORBIDDEN', 'Operator sign-in required');
  return { actorId: 'demo:company-operator' };
}
