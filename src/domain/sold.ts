// Sold items: an item is sold when its lessee buys it, at the end of the term or by ending the
// lease early. It then belongs to them and leaves the loop, so the catalogue never shows it;
// the admin page keeps the tally instead (how many, what they brought in, and which ones).

/** The contract fields a sale is read from (see src/server/contracts.ts). */
export type SaleSource = {
  id: string;
  assetId: string;
  customerName: string;
  status: string;
  boughtDate: string | null;
  /** What the customer paid for the item, incl. VAT. */
  buyoutPaidCents: number | null;
  exitedEarlyDate: string | null;
};

export type Sale = {
  contractId: string;
  assetId: string;
  customerName: string;
  date: string;
  paidCents: number;
  /** Bought by ending the lease early, rather than at the end of the term. */
  early: boolean;
};

export type SoldTally = { count: number; paidCents: number; sales: Sale[] };

/** Every sale among `contracts`, newest first, with their count and total. */
export function soldTally(contracts: readonly SaleSource[]): SoldTally {
  const sales = contracts
    .filter((c) => c.status === 'bought' && c.boughtDate !== null)
    .map((c): Sale => ({
      contractId: c.id,
      assetId: c.assetId,
      customerName: c.customerName,
      date: c.boughtDate as string,
      paidCents: c.buyoutPaidCents ?? 0,
      early: c.exitedEarlyDate !== null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.assetId.localeCompare(b.assetId, 'en'));
  return {
    count: sales.length,
    paidCents: sales.reduce((sum, sale) => sum + sale.paidCents, 0),
    sales,
  };
}
