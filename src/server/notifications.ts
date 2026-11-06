// What the bell counts for a viewer on the app's date: leases that have ended and wait for a
// choice (buy, return or pass on), items another customer passed on to them, and invoices to pay.
import type { PrismaClient } from '@/generated/prisma/client';
import { contractStage } from '@/domain/contract';
import { listContracts, type Contract } from './contracts';
import { pendingHandovers, type Handover } from './end-of-term';
import { receivedInvoices, type ReceivedInvoice } from './invoices';
import { viewerCustomerId, type Viewer } from './viewer';

export type Notifications = {
  endedLeases: Contract[];
  handovers: Handover[];
  dueInvoices: ReceivedInvoice[];
  count: number;
};

export async function notificationsFor(
  db: PrismaClient,
  viewer: Viewer,
  todayIso: string
): Promise<Notifications> {
  const filter = viewer.kind === 'staff' ? null : { customerId: viewerCustomerId(viewer) };
  const [contracts, received, handovers] = await Promise.all([
    listContracts(db, filter),
    receivedInvoices(db, filter, todayIso),
    // Only a customer can receive an item; staff see every pending handover.
    viewer.kind === 'guest'
      ? Promise.resolve([])
      : pendingHandovers(db, viewer.kind === 'staff' ? null : viewer.customer.id),
  ]);
  const endedLeases = contracts.filter(
    (contract) => contract.status === 'active' && contractStage(contract, todayIso) === 'ended'
  );
  const dueInvoices = received.filter((r) => r.invoice.status === 'due');
  return {
    endedLeases,
    handovers,
    dueInvoices,
    count: endedLeases.length + handovers.length + dueInvoices.length,
  };
}
