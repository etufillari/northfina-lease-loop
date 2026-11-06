// The status an invoice shows on a day, and what is open on a contract. Derived, never stored:
// the table stores only `issued` or `paid` and the paid day. Today comes in as an argument.
import type { InvoiceStatus } from '@/domain/statuses';
import { parseIsoDate } from './dates';

export type DisplayStatus = 'paid' | 'due' | 'overdue' | 'upcoming';

export type InvoiceForStatus = {
  issueDate: string;
  dueDate: string;
  /** Null until paid. */
  paidOn: string | null;
};

/**
 * `paid` once paid; else `upcoming` before the issue date, `due` from the issue date through
 * the due date, `overdue` the day after. With D3 issue and due coincide, so a rent is `due`
 * on that one day.
 */
export function invoiceStatusOn(invoice: InvoiceForStatus, today: string): DisplayStatus {
  parseIsoDate(today);
  if (invoice.paidOn !== null) return 'paid';
  if (today < invoice.issueDate) return 'upcoming';
  return today > invoice.dueDate ? 'overdue' : 'due';
}

export type InvoiceForBalance = InvoiceForStatus & {
  id: string;
  grossCents: number;
  /**
   * The stored status; a `cancelled` rent (replaced by an early exit's invoice) is skipped.
   * Required, so no caller can leave it out and count a cancelled rent again.
   */
  status: InvoiceStatus;
};

export type ContractBalance = {
  /** Issued and not paid: due today or overdue. */
  openCents: number;
  overdueCents: number;
  /** Not yet issued. */
  upcomingCents: number;
  paidCents: number;
  openInvoiceIds: string[];
  overdueInvoiceIds: string[];
};

/**
 * Sums a contract's invoices by status on `today`. `payments` maps an invoice id to its paid
 * day and overrides the invoice's own `paidOn` (a payment recorded after the rows were read);
 * a payment dated after `today` does not count yet. A `cancelled` invoice owes nothing and is
 * in none of the sums (D35).
 */
export function contractBalanceOn(
  invoices: readonly InvoiceForBalance[],
  payments: Readonly<Record<string, string>>,
  today: string
): ContractBalance {
  const balance: ContractBalance = {
    openCents: 0,
    overdueCents: 0,
    upcomingCents: 0,
    paidCents: 0,
    openInvoiceIds: [],
    overdueInvoiceIds: [],
  };
  for (const invoice of invoices) {
    if (invoice.status === 'cancelled') continue;
    const paidOn = payments[invoice.id] ?? invoice.paidOn;
    const status = invoiceStatusOn(
      { ...invoice, paidOn: paidOn !== null && paidOn <= today ? paidOn : null },
      today
    );
    if (status === 'paid') balance.paidCents += invoice.grossCents;
    else if (status === 'upcoming') balance.upcomingCents += invoice.grossCents;
    else {
      balance.openCents += invoice.grossCents;
      balance.openInvoiceIds.push(invoice.id);
      if (status === 'overdue') {
        balance.overdueCents += invoice.grossCents;
        balance.overdueInvoiceIds.push(invoice.id);
      }
    }
  }
  return balance;
}
