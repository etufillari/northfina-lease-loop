// Loads one invoice for the invoice and pay pages, with the demo-login check (viewer.ts):
// only the customer it belongs to, or staff, may see it.
import type { Asset } from '@/data/schemas';
import { loadCustomers } from '@/data/load';
import type { InvoiceWithStatus } from '@/domain/invoicing';
import { appDate } from './app-date';
import { getAsset } from './assets';
import { getContract, type Contract } from './contracts';
import { currentViewer } from './current-viewer';
import { db } from './db';
import { contractInvoices } from './invoices';
import { canSee } from './viewer';

export type InvoiceAccess =
  | { kind: 'not_found' }
  | { kind: 'not_yours'; ownerName: string | null }
  | {
      kind: 'ok';
      contract: Contract;
      invoice: InvoiceWithStatus;
      asset: Asset;
      today: string;
    };

export async function loadInvoice(contractId: string, number: string): Promise<InvoiceAccess> {
  const contract = await getContract(db, contractId);
  if (!contract) return { kind: 'not_found' };
  if (!canSee(await currentViewer(), contract.customerId)) {
    const owner = (await loadCustomers()).find((c) => c.id === contract.customerId);
    return { kind: 'not_yours', ownerName: owner?.name ?? null };
  }
  const { today } = await appDate();
  const [invoices, asset] = await Promise.all([
    contractInvoices(db, contract, today),
    getAsset(db, contract.assetId),
  ]);
  const invoice = invoices?.find((candidate) => String(candidate.number) === number);
  // An invoice that hasn't been issued yet doesn't exist for the customer.
  if (!invoice || invoice.status === 'upcoming' || !asset) return { kind: 'not_found' };
  return { kind: 'ok', contract, invoice, asset, today };
}
