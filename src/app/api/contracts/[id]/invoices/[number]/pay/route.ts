// POST /api/contracts/:id/invoices/:number/pay   body: { "actor": "Aino Virtanen" }
// DEMO payment: records the invoice as paid. No money moves and no bank details are taken;
// see src/server/invoices.ts.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { payInvoice } from '@/server/invoices';
import { canSee } from '@/server/viewer';

const bodySchema = z.strictObject({ actor: z.string().trim().min(1).max(100) });

const failures = {
  contract_not_found: [404, 'NOT_FOUND', 'Contract not found'],
  invoice_not_found: [404, 'NOT_FOUND', 'Invoice not found'],
  not_issued: [409, 'NOT_ISSUED', 'This invoice has not been issued yet'],
  already_paid: [409, 'ALREADY_PAID', 'This invoice has already been paid'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/invoices/[number]/pay'>) => {
    const { id, number } = await params;
    const invoiceNumber = Number(number);
    if (!Number.isInteger(invoiceNumber) || invoiceNumber < 1) {
      return fail(404, 'NOT_FOUND', 'Invoice not found');
    }
    const body = await readJsonBody(request, bodySchema);
    const contract = await getContract(db, id);
    if (contract && !canSee(await currentViewer(), contract.customerId)) {
      return fail(403, 'NOT_YOURS', 'This invoice belongs to another customer');
    }
    const result = await payInvoice(
      db,
      { contractId: id, invoiceNumber, actor: body.actor },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result);
  }
);
