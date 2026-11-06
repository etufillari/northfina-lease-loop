// The portal's invoice overview (D75): every invoice of one customer, across their contracts,
// sorted into what is owed today, what is not issued yet, what is paid and what was cancelled.
// The per-invoice status is the invoicing slice's `invoiceStatusOn`; the open and overdue sums
// equal `contractBalanceOn`'s summed over the contracts (pinned on card 8 in the tests). Today
// comes in as an argument.
import { invoiceStatusSchema } from '../statuses';
import { invoiceStatusOn, parseIsoDate } from '../invoicing';

/** What the portal needs of an invoice. `status` is the stored column, parsed here. */
export type PortalInvoice = {
  id: string;
  issueDate: string;
  dueDate: string;
  /** Integer cents, VAT included. */
  grossCents: number;
  status: string;
  /** Null until paid. */
  paidOn: string | null;
};

export type InvoiceGroups<T> = {
  /** Issued and unpaid on `today`: due today or overdue (D3: issue and due on one day). */
  open: T[];
  /** The part of `open` past its due day. */
  overdue: T[];
  /** Not issued yet (issue day after `today`). */
  upcoming: T[];
  paid: T[];
  /** Replaced by an exit's invoice (D35); owes nothing. */
  cancelled: T[];
  /** Sum of `open` in integer cents; plain integer addition, nothing to round. */
  openTotalCents: number;
  overdueTotalCents: number;
  /** The earliest due day among open and upcoming invoices; null when nothing is owed. */
  nextDueDate: string | null;
};

/**
 * Groups `invoices` on `today`, keeping their order inside each group. A stored `paid` with a
 * paid day after `today` (the demo clock moved back) counts as unpaid, as on the contract page.
 * Throws on a status that is not an invoice status, an amount that is not whole cents or a
 * `today` that is not a calendar day.
 */
export function groupInvoices<T extends PortalInvoice>(
  invoices: readonly T[],
  today: string
): InvoiceGroups<T> {
  parseIsoDate(today);
  const groups: InvoiceGroups<T> = {
    open: [],
    overdue: [],
    upcoming: [],
    paid: [],
    cancelled: [],
    openTotalCents: 0,
    overdueTotalCents: 0,
    nextDueDate: null,
  };
  for (const invoice of invoices) {
    if (!Number.isSafeInteger(invoice.grossCents)) {
      throw new RangeError(`grossCents must be whole cents, got ${invoice.grossCents}`);
    }
    const stored = invoiceStatusSchema.parse(invoice.status);
    if (stored === 'cancelled') {
      groups.cancelled.push(invoice);
      continue;
    }
    const paidOn = stored === 'paid' && invoice.paidOn !== null && invoice.paidOn <= today;
    const status = invoiceStatusOn({ ...invoice, paidOn: paidOn ? invoice.paidOn : null }, today);
    if (status === 'paid') {
      groups.paid.push(invoice);
      continue;
    }
    if (groups.nextDueDate === null || invoice.dueDate < groups.nextDueDate) {
      groups.nextDueDate = invoice.dueDate;
    }
    if (status === 'upcoming') {
      groups.upcoming.push(invoice);
      continue;
    }
    groups.open.push(invoice);
    groups.openTotalCents += invoice.grossCents;
    if (status === 'overdue') {
      groups.overdue.push(invoice);
      groups.overdueTotalCents += invoice.grossCents;
    }
  }
  return groups;
}
