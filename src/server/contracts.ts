// Signing turns an approved application into a locked Contract with its whole invoice
// schedule, flips the asset to leased and stamps the passport — one audited transaction.
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import { lockContract, signingStartDate } from '@/domain/contract';
import { scheduleInvoices } from '@/domain/invoicing';
import { monthlyFactorFor } from '@/domain/coefficient';
import type { Answers } from '@/domain/question-flow';
import type { PrismaClient } from '@/generated/prisma/client';
import { checkClaim } from '@/server/asset-claims';
import { withAudit } from '@/server/audit';
import { quoteAssetIds } from '@/server/quotes';
import { executeTransfer } from '@/server/transfers';

type Db = PrismaClient;

export type SignResult =
  | { ok: true; contractId: string }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_signable'
        | 'not_signatory'
        | 'not_applicant'
        | 'hold_expired'
        | 'quote_expired'
        | 'start_before_signing'
        | 'start_too_far_ahead'
        | 'no_vat_rate_on_date'
        | 'unpriceable_amount'
        | 'asset_unavailable'
        | 'transfer_closed';
    };

/**
 * `actor` is the customer on the happy path, or the signatory completing an
 * awaiting_signature application from the staff panel (the audit row shows who signed).
 */
export async function signApplication(
  db: Db,
  input: { applicationId: string; startDate: string; actor: string; asOf: string }
): Promise<SignResult> {
  const application = await db.application.findUnique({
    where: { id: input.applicationId },
    include: { quote: true },
  });
  if (!application) return { ok: false, reason: 'not_found' };
  if (application.status !== 'approved' && application.status !== 'awaiting_signature') {
    return { ok: false, reason: 'not_signable' };
  }
  // Only the right person signs (card 6): a company applicant who may not sign waits for the
  // authorised signatory; an approved application is signed by the applicant themselves.
  if (application.status === 'awaiting_signature') {
    const signatory = (application.signatory_email ?? '').trim().toLowerCase();
    if (!signatory || input.actor.trim().toLowerCase() !== signatory) {
      return { ok: false, reason: 'not_signatory' };
    }
  } else if (input.actor !== application.customer_id) {
    return { ok: false, reason: 'not_applicant' };
  }
  if (application.hold_until && input.asOf > application.hold_until) {
    return { ok: false, reason: 'hold_expired' };
  }

  // A transfer application moves the existing contract instead of creating a new one:
  // the locked rent and the remaining schedule carry over unchanged.
  if (application.transfer_contract_id) {
    const transferred = await executeTransfer(db, {
      applicationId: application.id,
      contractId: application.transfer_contract_id,
      newCustomerId: application.customer_id,
      actor: input.actor,
      asOf: input.asOf,
    });
    if (!transferred.ok) {
      return {
        ok: false,
        reason: transferred.reason === 'link_closed' ? 'transfer_closed' : 'not_signable',
      };
    }
    return { ok: true, contractId: transferred.contractId };
  }

  // Last line of defence: one physical item, one contract. Another customer may have signed
  // for it (or holds it) since this application was approved.
  const claim = await checkClaim(db, {
    assetIds: quoteAssetIds(application.quote),
    customerId: application.customer_id,
    asOf: input.asOf,
  });
  if (!claim.ok) return { ok: false, reason: 'asset_unavailable' };

  const startDate = signingStartDate({
    approved: application.start_date,
    requested: input.startDate,
    signedDate: input.asOf,
  });
  const [table, vatRates] = await Promise.all([loadCoefficientTable(), loadVatRates()]);
  const quote = application.quote;
  const factor = monthlyFactorFor(table, quote.financed_cents, quote.term_months);
  if (!factor.ok) return { ok: false, reason: 'unpriceable_amount' };
  const answers = JSON.parse(application.answers_json) as Answers;

  const locked = lockContract({
    quote: {
      listPriceCents: quote.list_price_cents,
      downPaymentCents: quote.down_payment_cents,
      financedCents: quote.financed_cents,
      termMonths: quote.term_months,
      band: quote.band,
      annualInterestPercent: factor.band.annual_interest_percent,
      factorPpm: quote.factor_ppm,
      monthlyNetRentCents: quote.monthly_net_rent_cents,
      netTotalCents: quote.net_total_cents,
      lastMonthNetRentCents: quote.last_month_net_rent_cents,
      buyoutNetCents: quote.buyout_net_cents,
    },
    quoteDate: quote.quote_date,
    priceListVersion: quote.price_list_version,
    signedDate: input.asOf,
    startDate: startDate,
    usagePurpose:
      answers['q_usage_purpose'] === undefined ? null : String(answers['q_usage_purpose']),
  });
  if (!locked.ok) return { ok: false, reason: locked.reason };

  const schedule = scheduleInvoices(
    {
      startDate: startDate,
      termMonths: quote.term_months,
      monthlyNetRentCents: quote.monthly_net_rent_cents,
      netTotalCents: quote.net_total_cents,
    },
    vatRates
  );
  if (!schedule.ok) return { ok: false, reason: schedule.reason };

  const contractId = crypto.randomUUID();
  const audited = withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.signed',
      entityType: 'contract',
      entityId: contractId,
      details: {
        applicationId: application.id,
        assetIds: quoteAssetIds(quote),
        priceListVersion: quote.price_list_version,
        startDate: startDate,
      },
    },
    async (tx) => {
      // Only one signature wins: a double-click or a second tab finds it already signed.
      const flipped = await tx.application.updateMany({
        where: { id: application.id, status: { in: ['approved', 'awaiting_signature'] } },
        data: { status: 'signed' },
      });
      if (flipped.count !== 1) throw new AlreadySigned();
      await tx.contract.create({
        data: {
          id: contractId,
          application_id: application.id,
          customer_id: application.customer_id,
          quote_date: quote.quote_date,
          price_list_version: quote.price_list_version,
          signed_date: input.asOf,
          start_date: startDate,
          term_months: quote.term_months,
          financed_cents: quote.financed_cents,
          monthly_net_rent_cents: quote.monthly_net_rent_cents,
          net_total_cents: quote.net_total_cents,
          last_month_net_rent_cents: quote.last_month_net_rent_cents,
          buyout_net_cents: quote.buyout_net_cents,
          usage_purpose: locked.contract.usagePurpose,
        },
      });
      for (const assetId of quoteAssetIds(quote)) {
        await tx.contractAsset.create({ data: { contract_id: contractId, asset_id: assetId } });
      }
      for (const invoice of schedule.invoices) {
        await tx.invoice.create({
          data: {
            contract_id: contractId,
            customer_id: application.customer_id,
            number: invoice.number,
            due_date: invoice.dueDate,
            period_start: invoice.periodStart,
            period_end: invoice.periodEnd,
            net_cents: invoice.netCents,
            vat_rate_bp: Math.round(invoice.vatRatePercent * 100),
            vat_cents: invoice.vatCents,
            total_cents: invoice.totalCents,
          },
        });
      }
      // A lease that came from a waiting-list offer closes that entry.
      const offers = await tx.reservation.findMany({
        where: {
          asset_id: { in: quoteAssetIds(quote) },
          active: true,
          waitlist_entry_id: { not: null },
        },
      });
      for (const entryId of new Set(offers.map((offer) => offer.waitlist_entry_id!))) {
        await tx.waitlistEntry.update({ where: { id: entryId }, data: { status: 'leased' } });
      }
      for (const assetId of quoteAssetIds(quote)) {
        await tx.reservation.updateMany({
          where: { asset_id: assetId, active: true },
          data: { active: false },
        });
        await tx.asset.update({ where: { id: assetId }, data: { status: 'leased' } });
        await tx.assetEvent.create({
          data: {
            asset_id: assetId,
            contract_id: contractId,
            type: 'leased',
            on_date: startDate,
            details_json: JSON.stringify({
              customerId: application.customer_id,
              termMonths: quote.term_months,
              monthlyNetRentCents: quote.monthly_net_rent_cents,
            }),
          },
        });
      }
    }
  );
  try {
    await audited;
  } catch (error) {
    if (error instanceof AlreadySigned) return { ok: false, reason: 'not_signable' };
    throw error;
  }
  return { ok: true, contractId };
}

/** Thrown inside the signing transaction to roll it back when someone signed first. */
class AlreadySigned extends Error {}

/** A contract with its invoices and assets, for the contract page and the profile. */
export function getContract(db: Db, id: string) {
  return db.contract.findUnique({
    where: { id },
    include: { invoices: { orderBy: { number: 'asc' } }, assets: true },
  });
}

/**
 * A customer's contracts: the ones they hold, and the ones they passed on — they still owe
 * (and keep the record of) the invoices for the months they used.
 */
export function listCustomerContracts(db: Db, customerId: string) {
  return db.contract.findMany({
    where: {
      OR: [{ customer_id: customerId }, { invoices: { some: { customer_id: customerId } } }],
    },
    include: { invoices: { orderBy: { number: 'asc' } }, assets: true },
    orderBy: { created_at: 'desc' },
  });
}

/**
 * The invoices one customer pays on a contract. After a take-over the earlier months stay
 * with the previous lessee; rows from before invoices had an owner belong to the holder.
 */
export function invoicesFor<T extends { customer_id: string | null }>(
  contract: { customer_id: string; invoices: T[] },
  customerId: string
): T[] {
  return contract.invoices.filter((i) => (i.customer_id ?? contract.customer_id) === customerId);
}
