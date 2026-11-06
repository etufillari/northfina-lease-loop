import type { ContractStatus, EndOfTermAction } from '@/data/schemas';
import { contractStatusSchema, endOfTermActionSchema } from '@/data/schemas';
import { endOfTermAvailabilityFor, type EndOfTermAvailability } from '../lifecycle/end-of-term';
import type { PrismaClient } from '../prisma-client';

export type CustomerLease = {
  id: string;
  status: ContractStatus;
  endsOn: string;
  monthlyNetRentCents: number;
  endOfTermAction: EndOfTermAction | null;
  asset: { make: string; model: string };
  endOfTerm: EndOfTermAvailability;
};

/** Lists one customer's leases, with the ones waiting for a decision first. */
export async function listCustomerLeases(
  db: PrismaClient,
  customerId: string,
  asOf: string
): Promise<CustomerLease[]> {
  const rows = await db.contract.findMany({
    where: { application: { customer_id: customerId } },
    include: {
      asset: true,
      invoices: { orderBy: { sequence: 'asc' }, include: { payments: true } },
    },
    orderBy: [{ ends_on: 'asc' }, { id: 'asc' }],
  });

  const leases: CustomerLease[] = rows.map((row) => ({
    id: row.id,
    status: contractStatusSchema.parse(row.status),
    endsOn: row.ends_on,
    monthlyNetRentCents: row.monthly_net_rent_cents,
    endOfTermAction: row.end_of_term_action
      ? endOfTermActionSchema.parse(row.end_of_term_action)
      : null,
    asset: { make: row.asset.make, model: row.asset.model },
    endOfTerm: endOfTermAvailabilityFor(row, asOf),
  }));

  return [
    ...leases.filter((lease) => lease.endOfTerm.status === 'ready'),
    ...leases.filter((lease) => lease.endOfTerm.status !== 'ready'),
  ];
}
