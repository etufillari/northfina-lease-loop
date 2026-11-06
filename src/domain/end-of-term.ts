// Spine step 6: when a lease reaches its end date without a decision. The contract stays active,
// because the customer still has the item and ownership isn't settled, but the term has ended:
// no more rent is billed (see invoicesDue) and the customer is asked to buy or return it.
// Pure: the date is an argument.
import { dueDateForMonth } from './lease-billing';

export type EndOfTerm = { ended: false } | { ended: true; endDate: string };

/** The term has ended on the day one month after the last monthly payment was due. */
export function endOfTerm(
  lease: { status: string; startDate: string; termMonths: number },
  today: string
): EndOfTerm {
  if (lease.status !== 'active') return { ended: false };
  const endDate = dueDateForMonth(lease.startDate, lease.termMonths);
  return today >= endDate ? { ended: true, endDate } : { ended: false };
}
