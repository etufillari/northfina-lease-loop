import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/server/api-response';

export const OPERATOR_COOKIE = 'lease-loop-operator';
const lifetimeSeconds = 4 * 60 * 60;
function signature(value: string) {
  return createHmac('sha256', process.env.LEASE_LOOP_OPERATOR_PASSWORD ?? '')
    .update(value)
    .digest('hex');
}
function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function createOperatorSession(password: string) {
  const expected = process.env.LEASE_LOOP_OPERATOR_PASSWORD;
  if (process.env.NODE_ENV !== 'development' || !expected)
    throw new ApiError(503, 'OPERATOR_NOT_CONFIGURED', 'Operator access is not configured');
  if (!equal(password, expected))
    throw new ApiError(403, 'FORBIDDEN', 'Invalid operator credentials');
  const value = String(Math.floor(Date.now() / 1000) + lifetimeSeconds);
  return `${value}.${signature(value)}`;
}
export function validOperatorSession(token: string | undefined): boolean {
  if (process.env.NODE_ENV !== 'development' || !process.env.LEASE_LOOP_OPERATOR_PASSWORD || !token)
    return false;
  const [expires, mac, extra] = token.split('.');
  return (
    !extra &&
    !!expires &&
    !!mac &&
    /^\d+$/.test(expires) &&
    Number(expires) > Math.floor(Date.now() / 1000) &&
    equal(mac, signature(expires))
  );
}
export function operatorCookieOptions() {
  return { httpOnly: true, sameSite: 'strict' as const, path: '/', maxAge: lifetimeSeconds };
}
