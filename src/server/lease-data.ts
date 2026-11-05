// The parts of the data pack that pricing, signing and invoicing need, loaded together.
import { loadCoefficientTable, loadCustomers, loadPriceLists, loadVatRates } from '@/data/load';
import type { CoefficientTable, Customer, PriceList, VatRates } from '@/data/schemas';

export interface LeaseDataPack {
  priceLists: PriceList[];
  coefficientTable: CoefficientTable;
  vatRates: VatRates;
  customers: Customer[];
}

export async function loadLeaseDataPack(): Promise<LeaseDataPack> {
  const [priceLists, coefficientTable, vatRates, customers] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
    loadCustomers(),
  ]);
  return { priceLists, coefficientTable, vatRates, customers };
}
