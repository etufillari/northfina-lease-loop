import { loadVatRates } from '@/data/load';
import { invoiceSchedule } from '@/domain/invoicing';
import { taxOn } from '@/domain/vat';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import { requireCustomer, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { rethrowDatabaseConflict } from './request-integrity';
import { contractTerms, getContract, ownedContract } from './spine-views';
import { requireStorableInvoice } from './spine-invoice-limits';

/** Issue only due, unissued periods. Forecast rows have never been persisted as invoices. */
export async function issueInvoices(db: PrismaClient, context: DemoContext, contractId: string) {
  requireCustomer(context);
  const contract = await ownedContract(db, context, contractId);
  if (contract.status !== 'active') return getContract(db, context, contractId);
  const terms = contractTerms(contract);
  const vatRates = await loadVatRates();
  const schedule = invoiceSchedule(
    {
      startDate: contract.start_date,
      termMonths: terms.termMonths,
      monthlyNetCents: terms.monthlyNetCents,
    },
    vatRates
  );
  if (!schedule.ok) throw new ApiError(422, 'VAT_UNAVAILABLE', 'A forecast VAT rate is missing');
  const persisted = await db.invoice.findMany({ where: { contract_id: contractId, kind: 'rent' } });
  const issued = new Set(persisted.map((row) => row.period));
  const due = schedule.invoices.filter(
    (row) => row.invoiceDate <= context.businessDate && !issued.has(row.period)
  );
  if (due.length === 0) return getContract(db, context, contractId);
  const taxed = taxOn(terms.monthlyNetCents, context.businessDate, vatRates);
  if (!taxed.ok)
    throw new ApiError(422, 'VAT_UNAVAILABLE', 'A VAT rate is missing for the issue date');
  requireStorableInvoice(taxed.amount);

  try {
    await withAudit(
      db,
      {
        actor: context.actor,
        action: 'invoices.issued',
        entityType: 'contract',
        entityId: contractId,
        details: { count: due.length, invoiceDate: context.businessDate },
      },
      async (tx) => {
        const current = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
        if (current.status !== 'active')
          throw new ApiError(409, 'RETRY_REQUEST', 'The contract changed; refresh and retry');
        for (const row of due) {
          // An overdue invoice is issued today, not silently backdated to its planned date.
          await tx.invoice.create({
            data: {
              id: `${contractId}:rent:${row.period}`,
              contract_id: contractId,
              kind: 'rent',
              period: row.period,
              scheduled_for: row.invoiceDate,
              invoice_date: context.businessDate,
              due_date: context.businessDate,
              net_cents: taxed.amount.netCents,
              vat_basis_points: taxed.amount.vatBasisPoints,
              vat_cents: taxed.amount.vatCents,
              gross_cents: taxed.amount.grossCents,
            },
          });
        }
      }
    );
  } catch (error) {
    const nowIssued = await db.invoice.count({
      where: {
        contract_id: contractId,
        kind: 'rent',
        period: { in: due.map((row) => row.period) },
      },
    });
    if (nowIssued !== due.length) rethrowDatabaseConflict(error);
  }
  return getContract(db, context, contractId);
}
