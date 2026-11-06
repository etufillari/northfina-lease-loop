// Signing a lease and reading contracts back. Signing locks a stored quote (D-014, D-034): the
// price the customer was shown, never numbers sent by the browser. Signing and its audit row
// commit together. An applicant who may not sign sends the lease to the person who must: it is
// stored waiting for them, not active, with the price locked (D-053).
import { z } from 'zod';
import type { AssetCategory, VatRates } from '@/data/schemas';
import { signContract, type Contract, type SignResult } from '@/domain/contract';
import { decideApplication, type Signer } from '@/domain/eligibility';
import { billedBefore, invoiceSchedule } from '@/domain/invoicing';
import { answersNotMatchingCustomer, customerOnRecord } from '@/domain/persona';
import type { Answers } from '@/domain/question-flow';
import type { Quote } from '@/domain/quote';
import { quoteToSign, type PriceChoice, type QuoteToSign } from '@/domain/signing';
import { withAudit } from './audit';
import type { LeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';
import { pricingPriceLists } from './pricing-price-lists';
import { getQuote, toQuoteRowData } from './quotes';
import { CorruptRowError, parseStoredJson } from './stored-row';

export type { LeaseDataPack } from './lease-data';

export interface SignLeaseInput {
  /** The stored quote the customer is signing. */
  quoteId: number;
  /** A data-pack persona; a new applicant is named by the email they gave. */
  customerId?: string;
  /** The application answers; the server decides them again before signing. */
  answers: Answers;
  /** Needed only when today's rent is lower than the quote's. */
  priceChoice?: PriceChoice;
  /** The monthly rent excl. VAT on screen when the customer signed; it must be what locks. */
  shownMonthlyNetRentCents: number;
  /** The effective today (D-030): signing and start date. */
  today: string;
  actor: string;
}

/** Why the application decided on the server can't be signed (D-024). */
type ApplicationRefusal =
  | 'no_vat_rate'
  | 'application_incomplete'
  | 'application_invalid'
  | 'application_declined'
  | 'application_needs_review';

/** Every reason `signLease` refuses; `POST /api/contracts` answers each in upper case. */
export type SignLeaseRefusal =
  | 'quote_not_found'
  | 'quote_already_used'
  | 'asset_not_found'
  | 'asset_not_available'
  | 'unknown_customer'
  | 'answers_do_not_match_customer'
  | Extract<QuoteToSign, { ok: false }>['reason']
  | Extract<SignResult, { ok: false }>['reason']
  | ApplicationRefusal;

/** Who must still sign a stored contract, and the day it was sent to them (D-053). */
export interface AwaitingSignature {
  email: string;
  sentOn: string;
}

export type SignLeaseResult =
  | {
      ok: true;
      id: number;
      contract: Contract;
      quoteId: number;
      /** Null when the applicant signed: the lease is active. */
      awaitingSignature: AwaitingSignature | null;
    }
  | {
      ok: false;
      reason: Exclude<SignLeaseRefusal, 'answers_do_not_match_customer' | 'price_choice_required'>;
    }
  /** The named customer's record says otherwise for these questions (D-031). */
  | { ok: false; reason: 'answers_do_not_match_customer'; questionIds: string[] }
  /** Today's rent is lower: the customer must choose before anything is signed (D-014). */
  | Extract<QuoteToSign, { reason: 'price_choice_required' }>;

/** Thrown inside the transaction to roll it back when the asset was taken meanwhile. */
class AssetTakenError extends Error {}
/** Thrown inside the transaction to roll it back when the quote was signed meanwhile. */
class QuoteUsedError extends Error {}

export async function signLease(
  db: PrismaClient,
  data: LeaseDataPack,
  input: SignLeaseInput
): Promise<SignLeaseResult> {
  const stored = await getQuote(db, input.quoteId);
  if (!stored) return { ok: false, reason: 'quote_not_found' };
  if (stored.contractId !== null) return { ok: false, reason: 'quote_already_used' };
  const asset = await db.asset.findUnique({ where: { id: stored.quote.assetId } });
  if (!asset) return { ok: false, reason: 'asset_not_found' };
  if (asset.status !== 'available') return { ok: false, reason: 'asset_not_available' };
  // A named customer must exist; an unnamed one may still be on record by email or business
  // ID, and is then held to that record too (D-031, D-040).
  const customer =
    input.customerId === undefined
      ? customerOnRecord(data.customers, input.answers)
      : data.customers.find((c) => c.id === input.customerId);
  if (input.customerId !== undefined && !customer) return { ok: false, reason: 'unknown_customer' };

  const chosen = quoteToSign(
    await pricingPriceLists(db, data),
    data.coefficientTable,
    stored.quote,
    input.today,
    {
      ...(input.priceChoice === undefined ? {} : { priceChoice: input.priceChoice }),
      shownMonthlyNetRentCents: input.shownMonthlyNetRentCents,
    }
  );
  if (!chosen.ok) return chosen;
  const { quote, check, priceChoice } = chosen;

  if (customer) {
    // A persona's answers must be the facts on its record, or anyone could sign as Mikko.
    const deal = {
      category: asset.category as AssetCategory,
      financedAmountCents: quote.financedCents,
      termMonths: quote.termMonths,
    };
    const questionIds = answersNotMatchingCustomer(data.questions, deal, customer, input.answers);
    if (questionIds.length > 0) {
      return { ok: false, reason: 'answers_do_not_match_customer', questionIds };
    }
  }
  const decided = decidedSigner(data, input, asset.category, quote);
  if (!decided.ok) return decided;
  // Not active until the signatory signs; the dates are set again then (D-053).
  const awaitingSignature: AwaitingSignature | null =
    decided.signer.kind === 'signatory'
      ? { email: decided.signer.email, sentOn: input.today }
      : null;

  const signed = signContract(quote, {
    customerId: customer?.id ?? `email:${String(input.answers.q_email)}`,
    signDate: input.today,
    startDate: input.today,
  });
  if (!signed.ok) return signed;
  const { contract } = signed;
  const tookTodaysPrice = priceChoice === 'todays_price';

  try {
    const row = await withAudit(
      db,
      (created: { id: number; signedQuoteId: number }) => ({
        actor: input.actor,
        action: awaitingSignature ? 'contract.sent_to_signatory' : 'contract.signed',
        entityType: 'contract',
        entityId: String(created.id),
        details: {
          ...(awaitingSignature ? { signatoryEmail: awaitingSignature.email } : {}),
          assetId: contract.assetId,
          customerId: contract.customerId,
          monthlyNetRentCents: contract.monthlyNetRentCents,
          priceListVersion: contract.priceListVersion,
          quoteId: stored.id,
          signedQuoteId: created.signedQuoteId,
          // What the price check found on the signing day and what the customer chose (D-014).
          priceCheck: check.kind,
          priceChoice,
          ...(check.kind === 'cheaper_today'
            ? { savingPerMonthCents: check.savingPerMonthCents }
            : {}),
          ...(check.kind === 'dearer_today'
            ? { extraPerMonthCents: check.extraPerMonthCents }
            : {}),
          asOf: input.today, // the effective date, which can be a demo date (D-030)
        },
      }),
      async (tx) => {
        // Only flips an asset that is still available, so two signings can't both win.
        const reserved = await tx.asset.updateMany({
          where: { id: contract.assetId, status: 'available' },
          data: { status: 'reserved' },
        });
        if (reserved.count !== 1) throw new AssetTakenError();
        const created = await tx.contract.create({
          data: {
            asset_id: contract.assetId,
            customer_id: contract.customerId,
            sign_date: contract.signDate,
            start_date: contract.startDate,
            terms_json: JSON.stringify(contract),
            ...(awaitingSignature
              ? {
                  status: 'awaiting_signatory',
                  signatory_email: awaitingSignature.email,
                  sent_on: awaitingSignature.sentOn,
                }
              : {}),
          },
        });
        // Only uses a quote nobody has signed yet, so one quote can't make two contracts.
        const used = await tx.quote.updateMany({
          where: { id: stored.id, contract_id: null },
          data: { contract_id: created.id },
        });
        if (used.count !== 1) throw new QuoteUsedError();
        // Today's cheaper price is stored as a quote of its own, so every contract has one.
        const signedQuoteId = tookTodaysPrice
          ? (
              await tx.quote.create({
                data: {
                  ...toQuoteRowData(quote),
                  replaces_quote_id: stored.id,
                  contract_id: created.id,
                },
                select: { id: true },
              })
            ).id
          : stored.id;
        return { id: created.id, signedQuoteId };
      }
    );
    return { ok: true, id: row.id, contract, quoteId: row.signedQuoteId, awaitingSignature };
  } catch (error) {
    if (error instanceof AssetTakenError) return { ok: false, reason: 'asset_not_available' };
    if (error instanceof QuoteUsedError) return { ok: false, reason: 'quote_already_used' };
    throw error;
  }
}

/**
 * Decides the application on the server with the deal being signed, so a stale or tampered
 * answer from the browser can't sign. Affordability uses the highest monthly total over the
 * term (D-023). Returns why it can't be signed, or who signs it: the applicant, or the
 * signatory they named (D-053).
 */
function decidedSigner(
  data: LeaseDataPack,
  input: SignLeaseInput,
  category: string,
  quote: Pick<Quote, 'financedCents' | 'monthlyNetRentCents' | 'termMonths'>
): { ok: false; reason: ApplicationRefusal } | { ok: true; signer: Signer } {
  const schedule = invoiceSchedule(
    {
      startDate: input.today,
      termMonths: quote.termMonths,
      monthlyNetRentCents: quote.monthlyNetRentCents,
      // Affordability looks at the monthly rents only; the down payment is invoice 0 (D-037).
      downPaymentCents: 0,
      billing: 'start_day_full_months',
    },
    data.vatRates
  );
  if (!schedule.ok) return { ok: false, reason: 'no_vat_rate' };
  const decision = decideApplication(data.questions, {
    deal: {
      category: category as AssetCategory,
      financedAmountCents: quote.financedCents,
      termMonths: quote.termMonths,
    },
    answers: input.answers,
    startDate: input.today,
    highestMonthlyGrossCents: Math.max(...schedule.invoices.map((i) => i.grossCents)),
  });
  if (decision.status !== 'decided') return { ok: false, reason: `application_${decision.status}` };
  if (decision.outcome === 'declined') return { ok: false, reason: 'application_declined' };
  if (decision.outcome === 'manual_review') {
    return { ok: false, reason: 'application_needs_review' };
  }
  return { ok: true, signer: decision.signer };
}

/** Mirrors the domain `Contract` type, so a hand-edited row is caught when read. */
const contractSchema = z.strictObject({
  assetId: z.string(),
  customerId: z.string(),
  quoteDate: z.iso.date(),
  signDate: z.iso.date(),
  startDate: z.iso.date(),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative(),
  priceListVersion: z.number().int().positive(),
  coefficientTableId: z.string(),
  listPriceCents: z.number().int().positive(),
  financedCents: z.number().int().positive(),
  band: z.string(),
  factor: z.number().positive(),
  monthlyNetRentCents: z.number().int().positive(),
  buyoutCents: z.number().int().nonnegative(),
  totalNetRentCents: z.number().int().positive(),
  totalNetCostCents: z.number().int().positive(),
  billing: z.literal('start_day_full_months'),
}) satisfies z.ZodType<Contract>;

export interface StoredContract {
  id: number;
  contract: Contract;
  /** Set while the contract waits for the person who must sign; null once it is active. */
  awaitingSignature: AwaitingSignature | null;
}

export async function getContract(db: PrismaClient, id: number): Promise<StoredContract | null> {
  const row = await db.contract.findUnique({ where: { id } });
  if (!row) return null;
  const contract = parseStoredJson(contractSchema, row.terms_json, { table: 'contract', id });
  return {
    id: row.id,
    contract: Object.freeze(contract),
    awaitingSignature: awaitingFromRow(row),
  };
}

/** A row waiting for a signature must say who and since when, or it is corrupt. */
function awaitingFromRow(row: {
  id: number;
  status: string;
  signatory_email: string | null;
  sent_on: string | null;
}): AwaitingSignature | null {
  if (row.status === 'active') return null;
  if (row.status === 'awaiting_signatory' && row.signatory_email && row.sent_on) {
    return { email: row.signatory_email, sentOn: row.sent_on };
  }
  throw new CorruptRowError(
    { table: 'contract', id: row.id },
    'awaiting status without who or when'
  );
}

/**
 * The invoices issued for a contract: none while it waits for a signature (D-053), and after an
 * ending only those issued before it took effect (D-033).
 */
export function issuedInvoices(
  found: Pick<StoredContract, 'contract' | 'awaitingSignature'>,
  ending: { effectiveDate: string } | null,
  vatRates: VatRates
) {
  if (found.awaitingSignature) return null;
  const full = invoiceSchedule(found.contract, vatRates);
  return full.ok
    ? { ok: true as const, ...billedBefore(full, ending?.effectiveDate ?? null) }
    : full;
}
