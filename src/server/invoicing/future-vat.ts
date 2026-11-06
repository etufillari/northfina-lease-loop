// Keeps invoices that are not due yet on the right VAT rate. All of a contract's invoices are
// created at signing, so a rate announced later would otherwise never reach them. Safe to run
// at any time: an invoice already on the right rate is left alone, and nothing is logged.
import { loadVatRates } from '@/data/load';
import { futureVatCorrections, type VatCorrection } from '@/domain/invoicing/invoicing';
import type { PrismaClient } from '@/generated/prisma/client';
import { SYSTEM_ACTOR, withAudit } from '../audit';
import { toInvoice } from './invoices';

function byContract(corrections: readonly VatCorrection[]): Map<string, VatCorrection[]> {
  const grouped = new Map<string, VatCorrection[]>();
  for (const correction of corrections) {
    grouped.set(correction.contract_id, [
      ...(grouped.get(correction.contract_id) ?? []),
      correction,
    ]);
  }
  return grouped;
}

/** Moves every invoice dated after `today` to the rate on its own date. One audit row a contract. */
export async function refreshFutureVat(
  db: PrismaClient,
  today: string
): Promise<{ updated: number }> {
  const rows = await db.invoice.findMany({
    where: { status: 'issued', invoice_date: { gt: today } },
    orderBy: [{ contract_id: 'asc' }, { sequence: 'asc' }],
  });
  const corrections = futureVatCorrections(rows.map(toInvoice), await loadVatRates(), today);

  for (const [contractId, invoices] of byContract(corrections)) {
    await withAudit(
      db,
      {
        actor: SYSTEM_ACTOR,
        action: 'invoice.vat_updated',
        entityType: 'contract',
        entityId: contractId,
        details: {
          invoices: invoices.map(({ sequence, from_basis_points, vat_rate_basis_points }) => ({
            sequence,
            from_percent: from_basis_points / 100,
            to_percent: vat_rate_basis_points / 100,
          })),
        },
      },
      async (tx) => {
        for (const { id, vat_rate_basis_points, vat_cents, total_cents } of invoices) {
          await tx.invoice.updateMany({
            where: { id, status: 'issued' },
            data: { vat_rate_basis_points, vat_cents, total_cents },
          });
        }
      }
    );
  }
  return { updated: corrections.length };
}
