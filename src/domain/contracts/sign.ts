// Signing: turns an approved application and its stored quote into a contract and the
// CONTRACT_SIGNED event, or refuses with a code. Pure: the caller reads the rows, the day and
// the price list in force, and writes the result. The contract copies the quote's frozen
// numbers and never re-prices (D7); a later price list only changes what the page explains.
import { assetStatusSchema, isoDateSchema } from '@/data/schemas';
import { contractSignedSchema, type ContractSigned } from '@/domain/events';
import { addMonthsClamped, termEndDate } from '@/domain/invoicing/dates';
import { birthdayAtAge, MIN_AGE_YEARS } from '@/domain/question-flow/eligibility';
import type { FrozenQuote, QuoteStatus } from '@/domain/pricing';
import { applicationDecisionSchema, type ContractStatus } from '@/domain/statuses';
import { contractNumber } from './number';

/**
 * The latest start is this many calendar months after the signing day (D45: today or a chosen
 * day up to one year ahead; D7 lets the start come later). Counted with `addMonthsClamped`, so
 * a signing on 29 February 2028 may start up to 28 February 2029.
 */
export const START_MONTHS_MAX = 12;

/**
 * The units one contract can lock at signing: its one asset row (D76). Raised only when issue #13
 * gives a contract several rows of identical units.
 */
export const UNITS_PER_CONTRACT = 1;

export type PlanContractInput = {
  /** The new contract's id, chosen by the caller so the event can name it. */
  contractId: string;
  applicationId: string;
  customerId: string;
  /** The application's decision; parsed here (D23). */
  decision: string;
  /** The asset's status as read before signing; parsed here (D23). */
  assetStatus: string;
  /** The stored quote's frozen numbers; `isoDate` is the quote day. */
  quote: FrozenQuote & { validUntil: string };
  /** The stored quote's status on the signing day (`storedQuoteStatusOn`). */
  quoteStatus: QuoteStatus;
  /** What the same quote would cost today on today's list, or null when none prices it. */
  currentMonthlyNetCents: number | null;
  /** The request's day (`todayForRequest()`), never the browser's. */
  signedOn: string;
  startDate: string;
  /** The customer's birth date from the record; undefined for a company (no age check). */
  birthDate?: string;
};

export type PlannedContract = {
  id: string;
  number: string;
  applicationId: string;
  customerId: string;
  assetId: string;
  quantity: number;
  signedOn: string;
  startDate: string;
  /** Inclusive: the last day of the term. */
  endDate: string;
  termMonths: number;
  unitListPriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  band: string;
  factorMillionths: number;
  monthlyNetCents: number;
  buyoutCents: number;
  vatRateBasisPoints: number;
  priceListVersion: number;
  status: ContractStatus;
};

/** Why the contract's price differs from today's list (card 2). The page writes it. */
export type PriceLock = {
  code: 'price_locked_from_quote';
  params: {
    quoteDate: string;
    priceListVersion: number;
    currentPriceListVersion: number;
    currentMonthlyNetCents: number;
  };
};

export type SignRefusal =
  | { code: 'application_not_approved'; params: { decision: string } }
  | { code: 'quote_expired'; params: { validUntil: string } }
  | { code: 'asset_not_available'; params: { status: string } }
  | { code: 'not_enough_units'; params: { requested: number; available: number } }
  | { code: 'quote_not_yet_valid'; params: { quoteDate: string } }
  | { code: 'start_before_signing'; params: { signedOn: string; startDate: string } }
  | {
      code: 'start_too_far';
      params: { maxStartDate: string; startDate: string; maxMonths: number };
    }
  | { code: 'too_young_at_start'; params: { adultFrom: string } };

export type PlanContractResult =
  | { ok: true; contract: PlannedContract; event: ContractSigned; priceLock: PriceLock | null }
  | { ok: false; reason: SignRefusal };

/**
 * Plans a signing. Refusals in this order: the decision, the quote's validity, the asset, the
 * start day, then the age: a person under 18 on the start day is refused (D9 checked again at
 * signing, since the start may come after the application day). A bad decision, status or day throws (D23): the caller writes nothing.
 */
export function planContract(input: PlanContractInput): PlanContractResult {
  const decision = applicationDecisionSchema.parse(input.decision);
  const assetStatus = assetStatusSchema.parse(input.assetStatus);
  const signedOn = isoDateSchema.parse(input.signedOn);
  const startDate = isoDateSchema.parse(input.startDate);
  const birthDate =
    input.birthDate === undefined ? undefined : isoDateSchema.parse(input.birthDate);
  const { quote, quoteStatus } = input;

  if (decision !== 'approved') {
    return { ok: false, reason: { code: 'application_not_approved', params: { decision } } };
  }
  if (quoteStatus.status === 'expired') {
    return {
      ok: false,
      reason: { code: 'quote_expired', params: { validUntil: quote.validUntil } },
    };
  }
  if (assetStatus !== 'available') {
    return { ok: false, reason: { code: 'asset_not_available', params: { status: assetStatus } } };
  }
  // D76: a contract holds one asset row and signing locks exactly that row, so it delivers one
  // unit. Since D8 was decided (every item is unique) a quote always prices one unit; this stays
  // as a guard against a stored quote row from before that, which signing must never oversell.
  if (quote.quantity > UNITS_PER_CONTRACT) {
    return {
      ok: false,
      reason: {
        code: 'not_enough_units',
        params: { requested: quote.quantity, available: UNITS_PER_CONTRACT },
      },
    };
  }
  // A demo clock moved back must not sign a contract dated before its quote (review finding 10).
  if (signedOn < quote.isoDate) {
    return {
      ok: false,
      reason: { code: 'quote_not_yet_valid', params: { quoteDate: quote.isoDate } },
    };
  }
  // ISO days compare correctly as strings.
  if (startDate < signedOn) {
    return { ok: false, reason: { code: 'start_before_signing', params: { signedOn, startDate } } };
  }
  const maxStartDate = addMonthsClamped(signedOn, START_MONTHS_MAX);
  if (startDate > maxStartDate) {
    return {
      ok: false,
      reason: {
        code: 'start_too_far',
        params: { maxStartDate, startDate, maxMonths: START_MONTHS_MAX },
      },
    };
  }

  if (birthDate !== undefined) {
    const adultFrom = birthdayAtAge(birthDate, MIN_AGE_YEARS);
    if (startDate < adultFrom) {
      return { ok: false, reason: { code: 'too_young_at_start', params: { adultFrom } } };
    }
  }

  const endDate = termEndDate(startDate, quote.termMonths);
  const contract: PlannedContract = {
    id: input.contractId,
    number: contractNumber(signedOn, input.applicationId),
    applicationId: input.applicationId,
    customerId: input.customerId,
    assetId: quote.assetId,
    quantity: quote.quantity,
    signedOn,
    startDate,
    endDate,
    termMonths: quote.termMonths,
    unitListPriceCents: quote.unitListPriceCents,
    downPaymentCents: quote.downPaymentCents,
    financedCents: quote.financedCents,
    band: quote.band,
    factorMillionths: quote.factorMillionths,
    monthlyNetCents: quote.monthlyNetCents,
    buyoutCents: quote.buyoutCents,
    vatRateBasisPoints: quote.vatRateBasisPoints,
    priceListVersion: quote.priceListVersion,
    status: 'active',
  };
  const event = contractSignedSchema.parse({
    type: 'CONTRACT_SIGNED',
    contractId: contract.id,
    customerId: contract.customerId,
    assetId: contract.assetId,
    quantity: contract.quantity,
    signedOn,
    startDate,
    endDate,
    termMonths: contract.termMonths,
    downPaymentCents: contract.downPaymentCents,
    netRentCents: contract.monthlyNetCents,
    buyoutCents: contract.buyoutCents,
    vatRateBasisPoints: contract.vatRateBasisPoints,
  });
  return { ok: true, contract, event, priceLock: priceLockOf(input) };
}

/** The explanation when today's list is another version than the quote's; else null. */
export function priceLockOf(input: {
  quote: Pick<FrozenQuote, 'isoDate' | 'priceListVersion'>;
  quoteStatus: Pick<QuoteStatus, 'todayList'>;
  currentMonthlyNetCents: number | null;
}): PriceLock | null {
  const { todayList } = input.quoteStatus;
  if (todayList === null || input.currentMonthlyNetCents === null) return null;
  if (todayList.version === input.quote.priceListVersion) return null;
  return {
    code: 'price_locked_from_quote',
    params: {
      quoteDate: input.quote.isoDate,
      priceListVersion: input.quote.priceListVersion,
      currentPriceListVersion: todayList.version,
      currentMonthlyNetCents: input.currentMonthlyNetCents,
    },
  };
}
