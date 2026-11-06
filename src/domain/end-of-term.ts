// Spine step 6: what can happen when a lease ends. Buy it, return it, or pass it on.
//
// Rules:
// - A choice can be made from the day after the last day of the lease, once.
// - Buying needs every invoice paid first, because ownership passes to the customer. The
//   buyout price excl. VAT was fixed at signing; VAT is added at the rate on the buying day,
//   like an invoice, and rounded once to the cent.
// - Returning and passing on can be chosen with invoices still open: those stay owed.
import type { VatRates } from '@/data/schemas';
import { contractStage } from './contract';
import type { InvoiceWithStatus } from './invoicing';
import { percentOfCents } from './money';
import { vatPercentOn } from './vat';

export type BuyoutQuote = {
  netCents: number;
  vatPercent: number;
  vatCents: number;
  totalCents: number;
};

/** The buyout price with VAT on `today`, or `null` if no VAT rate covers that day. */
export function buyoutQuote(
  buyoutNetCents: number,
  vatRates: VatRates,
  today: string
): BuyoutQuote | null {
  const vatPercent = vatPercentOn(vatRates, today);
  if (vatPercent === null) return null;
  const vatCents = percentOfCents(buyoutNetCents, vatPercent);
  return { netCents: buyoutNetCents, vatPercent, vatCents, totalCents: buyoutNetCents + vatCents };
}

export type EndOfTermChoice = {
  /** True when the customer can choose now. */
  canDecide: boolean;
  /** Why not: the lease is still running (or hasn't started), or the choice was made. */
  reason: 'not_ended' | 'already_decided' | null;
  unpaidCount: number;
  unpaidCents: number;
  /** Buying also needs all invoices paid. */
  canBuy: boolean;
};

export function endOfTermChoice(
  contract: { status: string; startDate: string; endDate: string },
  invoices: readonly InvoiceWithStatus[],
  today: string
): EndOfTermChoice {
  const unpaid = invoices.filter((invoice) => invoice.status === 'due');
  const unpaidCount = unpaid.length;
  const unpaidCents = unpaid.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const reason =
    contract.status !== 'active'
      ? 'already_decided'
      : contractStage(contract, today) !== 'ended'
        ? 'not_ended'
        : null;
  const canDecide = reason === null;
  return { canDecide, reason, unpaidCount, unpaidCents, canBuy: canDecide && unpaidCount === 0 };
}
