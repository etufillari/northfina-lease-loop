// What the leases page and the customer portal read (D75), each table through its owner's read
// function (team rule 3), and the pure grouping on the request's day. Writes nothing.
import type { Asset } from '@/data/schemas';
import { endOfTermChoices, groupInvoices, type ExitChoices } from '@/domain/portal';
import { listApplications, type ApplicationView } from '@/server/applications';
import { listAssets } from '@/server/assets';
import { listContracts, type ContractView } from '@/server/contracts';
import { db } from '@/server/db';
import { listCustomerInvoices } from '@/server/invoices';
import { getQuote, listReservedQuotesFor, type StoredQuote } from '@/server/quotes';

export type UnsignedApplication = { application: ApplicationView; asset: Asset | undefined };

/** Contracts, the applications not signed yet and the asset of each, for one customer or all. */
export async function readLeases(filter: { customerId?: string }) {
  const [contracts, applications, assets] = await Promise.all([
    listContracts(db, filter),
    listApplications(db, filter),
    listAssets(db),
  ]);
  const assetById = new Map(assets.map((a) => [a.id, a]));
  // An application that became a contract is listed as the contract only; one the applicant
  // withdrew (D87) is no longer waiting for anything and is not listed.
  const signed = new Set(contracts.map((c) => c.applicationId));
  const unsigned: UnsignedApplication[] = await Promise.all(
    applications
      .filter((a) => !signed.has(a.id) && a.decision !== 'withdrawn')
      .map(async (application) => {
        const quote = await getQuote(db, application.quoteId);
        return { application, asset: quote ? assetById.get(quote.breakdown.assetId) : undefined };
      })
  );
  return { contracts, unsigned, assetById, applications };
}

/** D90: an offer a pass-on made for this customer, with its item. */
export type PassedOnOffer = { quote: StoredQuote; asset: Asset | undefined };

export type PortalContract = { contract: ContractView; choices: ExitChoices };

/** Everything of one customer on `today`: the leases, each contract's exit choices, the invoices. */
export async function readPortal(customerId: string, today: string) {
  const [leases, invoices, held] = await Promise.all([
    readLeases({ customerId }),
    listCustomerInvoices(db, { customerId }),
    listReservedQuotesFor(db, customerId, today),
  ]);
  // D90: the quotes a pass-on holds for this customer that they have not applied for yet.
  const applied = new Set(
    leases.applications.filter((a) => a.decision !== 'withdrawn').map((a) => a.quoteId)
  );
  const offers: PassedOnOffer[] = held
    .filter((q) => !applied.has(q.id))
    .map((quote) => ({ quote, asset: leases.assetById.get(quote.breakdown.assetId) }));
  const contracts: PortalContract[] = leases.contracts.map((contract) => ({
    contract,
    choices: endOfTermChoices(contract, today),
  }));
  const numberOf = new Map(leases.contracts.map((c) => [c.id, c.number]));
  return {
    ...leases,
    contracts,
    offers,
    invoices: groupInvoices(invoices, today),
    numberOf,
    activeCount: leases.contracts.filter((c) => c.status === 'active').length,
  };
}
