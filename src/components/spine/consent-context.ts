import type { AssetCondition } from '@/data/schemas';
import type { EndChoice } from '@/domain/lifecycle';
import type { Answers } from '@/domain/question-flow';
import type { Locale } from '@/i18n/locales';
import type { ApplicationView, ContractView, QuoteView } from '@/server/spine-views';
import type { Bootstrap } from './price-panel';

/** Not a signature/hash. These values define which review a local checkbox belongs to. */
export function applicationConsentKey(input: {
  locale: Locale;
  data: Bootstrap;
  quote: QuoteView;
  application: ApplicationView;
  answers: Answers;
}): string {
  const { locale, data, quote, application, answers } = input;
  return JSON.stringify([
    locale,
    data.businessDate,
    data.customer,
    data.asset.id,
    quote,
    application,
    answers,
    data.vatRates,
  ]);
}

export function endConsentKey(input: {
  locale: Locale;
  data: Bootstrap;
  contract: ContractView;
  choice: EndChoice;
  condition: AssetCondition;
  usageText: string;
  successorId: string;
}): string {
  const { locale, data, contract, choice, condition, usageText, successorId } = input;
  return JSON.stringify([
    locale,
    contract.id,
    contract.status,
    contract.terms,
    contract.invoices,
    data.customer.id,
    data.businessDate,
    data.vatRates,
    data.asset,
    choice,
    condition,
    usageText,
    successorId,
  ]);
}
