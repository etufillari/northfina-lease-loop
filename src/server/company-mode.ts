import { cookies } from 'next/headers';
import { COMPANY_MODE_COOKIE } from '@/company-mode';

export async function companyModeActive(): Promise<boolean> {
  return (await cookies()).get(COMPANY_MODE_COOKIE)?.value === '1';
}

export function companyModeRequest(request: Request): boolean {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .some((value) => value.trim() === `${COMPANY_MODE_COOKIE}=1`) ?? false
  );
}
