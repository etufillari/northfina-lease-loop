import type { Customer } from '@/data/schemas';

export const ACTIVE_USER_COOKIE = 'lease-loop-active-user';

export type CustomerType = Customer['type'];
export type ActiveUserOption = Pick<Customer, 'id' | 'name' | 'type'>;
