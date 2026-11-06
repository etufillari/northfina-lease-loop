// Smart Problem 2: a fair early exit. What does it cost to end a lease before its last day?
//
// What the lessor is still owed for the rest of the lease is two things: the rents not yet
// invoiced, and at the end either the buyout or the item back. Money now is worth more than
// money later, so both are discounted to today at the contract's own interest rate (its band's
// annual interest, monthly = annual / 12):
//
//   still owed today = Σ rent / (1 + r)^i  for each remaining month i = 1…n
//                    + buyout / (1 + r)^n
//
// - Buy it now:    pay what is still owed today. At the last month (n = 0) this is exactly the
//                  buyout, the same price as buying at the normal end of term.
// - Return it now: pay what is still owed today minus what the item is worth on the market
//                  today (the second-life valuation), never below zero. If the item is worth more
//                  than what is still owed, returning it early costs nothing.
// - Within the first month (before the second invoice) returning is free: the first month's
//   rent, paid at signing, covers it.
//
// Open invoices must be paid first, as at the normal end of term. VAT is added at today's rate.
// Each amount is rounded once, half up, to a whole cent.
import { addMonths } from './contract';
import { percentOfCents } from './money';

export type EarlyExitInput = {
  startDate: string;
  termMonths: number;
  monthlyNetCents: number;
  buyoutCents: number;
  /** The contract band's annual interest, e.g. 7.9. */
  annualInterestPercent: number;
  /** Invoices issued so far (the months already billed). */
  invoicesIssued: number;
  /** What the item is worth on the market today, net cents. */
  marketValueCents: number;
  vatPercent: number;
  today: string;
};

export type EarlyExitQuote = {
  coolingOff: boolean;
  remainingMonths: number;
  remainingRentsCents: number;
  monthlyRatePercent: number;
  presentRentsCents: number;
  presentBuyoutCents: number;
  /** What is still owed today: discounted rents + discounted buyout. */
  stillOwedCents: number;
  marketValueCents: number;
  buy: { netCents: number; vatCents: number; totalCents: number };
  return: { netCents: number; vatCents: number; totalCents: number };
};

const withVat = (netCents: number, vatPercent: number) => {
  const vatCents = percentOfCents(netCents, vatPercent);
  return { netCents, vatCents, totalCents: netCents + vatCents };
};

export function earlyExitQuote(input: EarlyExitInput): EarlyExitQuote {
  const remainingMonths = Math.max(0, input.termMonths - input.invoicesIssued);
  const r = input.annualInterestPercent / 100 / 12;
  let presentRents = 0;
  for (let i = 1; i <= remainingMonths; i++) presentRents += input.monthlyNetCents / (1 + r) ** i;
  const presentRentsCents = Math.round(presentRents);
  const presentBuyoutCents = Math.round(input.buyoutCents / (1 + r) ** remainingMonths);
  const stillOwedCents = presentRentsCents + presentBuyoutCents;
  const coolingOff = input.today < addMonths(input.startDate, 1);
  const returnNet = coolingOff ? 0 : Math.max(0, stillOwedCents - input.marketValueCents);
  return {
    coolingOff,
    remainingMonths,
    remainingRentsCents: input.monthlyNetCents * remainingMonths,
    monthlyRatePercent: input.annualInterestPercent / 12,
    presentRentsCents,
    presentBuyoutCents,
    stillOwedCents,
    marketValueCents: input.marketValueCents,
    buy: withVat(stillOwedCents, input.vatPercent),
    return: withVat(returnNet, input.vatPercent),
  };
}
