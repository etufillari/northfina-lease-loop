// The parts of the data pack that pricing, the application, signing and invoicing need.
import {
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadQuestions,
  loadVatRates,
} from '@/data/load';
import type { CoefficientTable, Customer, PriceList, Question, VatRates } from '@/data/schemas';

export interface LeaseDataPack {
  priceLists: PriceList[];
  coefficientTable: CoefficientTable;
  vatRates: VatRates;
  customers: Customer[];
  questions: Question[];
}

export async function loadLeaseDataPack(): Promise<LeaseDataPack> {
  const [priceLists, coefficientTable, vatRates, customers, questionsFile] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
    loadCustomers(),
    loadQuestions(),
  ]);
  return { priceLists, coefficientTable, vatRates, customers, questions: questionsFile.questions };
}
