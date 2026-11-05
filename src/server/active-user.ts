import { cookies } from 'next/headers';
import { loadCustomers } from '@/data/load';
import { ACTIVE_USER_COOKIE, type ActiveUserOption } from '@/active-user';
import type { Customer } from '@/data/schemas';

export async function listActiveUserOptions(): Promise<ActiveUserOption[]> {
  const customers = await loadCustomers();
  return customers.map(({ id, name, type }) => ({ id, name, type }));
}

export async function getActiveUser(): Promise<Customer | null> {
  const userId = (await cookies()).get(ACTIVE_USER_COOKIE)?.value;
  if (!userId) return null;

  const customers = await loadCustomers();
  return customers.find((customer) => customer.id === userId) ?? null;
}
