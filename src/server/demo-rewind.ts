// Applies a demo-clock rewind for one customer (see src/domain/demo-rewind.ts). Runs inside the
// caller's audited transaction (setting the demo date or switching persona), so the undo and its
// audit row are written together. Demo mode only; real leases are never touched.
import { rewindStep } from '@/domain/demo-rewind';
import { AWAITING_SIGNATURE } from '@/domain/signatory';
import type { TransactionClient } from './audit';

export type RewindSummary = {
  removedLeases: string[];
  reopenedLeases: string[];
  removedInvoices: number;
  removedApplications: number;
};

/** Undoes the customer's demo actions dated after `date`. Safe to run again: then a no-op. */
export async function rewindDemo(
  tx: TransactionClient,
  customerId: string,
  date: string
): Promise<RewindSummary> {
  const contracts = await tx.contract.findMany({
    where: { customerId, isDemo: true },
    select: {
      id: true,
      isDemo: true,
      status: true,
      startDate: true,
      endedOn: true,
      signatoryEmail: true,
      signedOn: true,
      assetId: true,
    },
  });
  const summary: RewindSummary = {
    removedLeases: [],
    reopenedLeases: [],
    removedInvoices: 0,
    removedApplications: 0,
  };
  const removed = new Set<string>();
  for (const contract of contracts) {
    const step = rewindStep(contract, date);
    if (!step) continue;
    if (step === 'remove') {
      await removeLease(tx, contract.id);
      removed.add(contract.id);
      summary.removedLeases.push(contract.id);
      continue;
    }
    // Invoices, their payments and events after the date hadn't happened yet.
    const invoices = await tx.invoice.findMany({
      where: { contractId: contract.id, dueDate: { gt: date } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((invoice) => invoice.id);
    await tx.payment.deleteMany({
      where: {
        OR: [
          { invoiceId: { in: invoiceIds } },
          { invoice: { contractId: contract.id }, paidDate: { gt: date } },
        ],
      },
    });
    summary.removedInvoices += (
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } })
    ).count;
    await tx.leaseEvent.deleteMany({ where: { contractId: contract.id, eventDate: { gt: date } } });
    if (step === 'unsign') {
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: AWAITING_SIGNATURE, signedOn: null },
      });
      summary.reopenedLeases.push(contract.id);
    } else if (step === 'unbuy') {
      // The buyout payment ended the lease; without it, the lease runs and the item is leased.
      await tx.leaseActionPayment.deleteMany({ where: { contractId: contract.id } });
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: 'active', endedOn: null },
      });
      await tx.asset.update({ where: { id: contract.assetId }, data: { status: 'reserved' } });
      summary.reopenedLeases.push(contract.id);
    }
  }
  // Items whose only lease was removed are back in the catalogue.
  for (const assetId of new Set(
    contracts.filter((contract) => removed.has(contract.id)).map((contract) => contract.assetId)
  )) {
    const others = await tx.contract.count({ where: { assetId } });
    if (others === 0)
      await tx.asset.update({
        where: { id: assetId },
        data: { status: 'available', firstLeaseDate: null, originalPriceCents: null },
      });
    else if (
      !(await tx.contract.count({
        where: { assetId, status: { in: ['active', AWAITING_SIGNATURE] } },
      }))
    )
      await tx.asset.updateMany({
        where: { id: assetId, status: { in: ['reserved', 'sold'] } },
        data: { status: 'available' },
      });
  }
  summary.removedApplications = (
    await tx.leaseApplication.deleteMany({ where: { customerId, startDate: { gt: date } } })
  ).count;
  return summary;
}

/** A lease and everything recorded on it. */
async function removeLease(tx: TransactionClient, contractId: string) {
  await tx.payment.deleteMany({ where: { invoice: { contractId } } });
  await tx.invoice.deleteMany({ where: { contractId } });
  await tx.returnAssessment.deleteMany({ where: { request: { contractId } } });
  await tx.leaseRequest.deleteMany({ where: { contractId } });
  await tx.leaseEvent.deleteMany({ where: { contractId } });
  await tx.leaseActionPayment.deleteMany({ where: { contractId } });
  await tx.coLeaseShare.deleteMany({ where: { contractId } });
  await tx.contract.delete({ where: { id: contractId } });
}
