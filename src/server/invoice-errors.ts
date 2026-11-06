import { ApiError } from './api-response';
import type { InvoiceGenerationFailure, InvoiceListResult } from './invoices';

type InvoiceApiFailure = InvoiceGenerationFailure | Extract<InvoiceListResult, { ok: false }>;

/** Maps invoice service failures to stable API errors. */
export function throwInvoiceError(result: InvoiceApiFailure): never {
  switch (result.reason) {
    case 'contract_not_found':
      throw new ApiError(404, 'INVOICE_CONTRACT_NOT_FOUND', 'The contract was not found');
    case 'contract_not_active':
      throw new ApiError(422, 'CONTRACT_NOT_ACTIVE', 'Invoices require an active contract', {
        status: result.status,
      });
    case 'invoice_schedule_not_generated':
      throw new ApiError(404, 'INVOICE_SCHEDULE_NOT_GENERATED', 'No invoice schedule exists');
    case 'no_vat_rate_on_date':
      throw new ApiError(422, 'VAT_RATE_NOT_FOUND', 'No VAT rate covers the invoice date', {
        sequence: result.sequence,
        invoiceDate: result.invoiceDate,
      });
    default: {
      const exhaustive: never = result;
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to process invoices', exhaustive);
    }
  }
}
