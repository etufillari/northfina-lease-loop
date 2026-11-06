// Server persistence for the lease lifecycle models: Quote, Application, Contract,
// InvoiceRow, and AssetEvent. Every write runs inside a single `withAudit()` transaction.
import type { PrismaClient } from '@/generated/prisma/client';
import type { Asset } from '@/data/schemas';
import { calculateContractQuote, type ContractQuote } from '@/domain/contract-pricing';
import {
  addMonthsClamped,
  generateInvoiceSchedule,
  type InvoiceSchedule,
  type MonthlyInvoice,
} from '@/domain/invoice-schedule';
import { calculateQuoteWithOffer } from '@/domain/offer';
import { effectiveAssetPriceOn } from '@/domain/price-list';
import { pruneAnswers, type AnswerValue } from '@/domain/question-flow';
import { toAsset } from './assets';
import { withAudit } from './audit';
import {
  bpToPercent,
  ppmToFraction,
  readCoefficientTable,
  readPriceLists,
  readQuestions,
  readVatRates,
} from './reference-read';
import { fractionToPpm, percentToBp } from './reference-rows';
import { todayIso } from './today';

/** Returns the ISO date (`YYYY-MM-DD`) one calendar day before `isoDate`. */
export function subtractOneDayIso(isoDate: string): string {
  const [y = 0, m = 1, d = 1] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d - 1));
  const year = String(utc.getUTCFullYear()).padStart(4, '0');
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type SignContractInput = {
  assetId: string;
  actor: string;
  termMonths: number;
  downPaymentCents: number;
  signedOn?: string;
  token?: string | null;
  answers?: Record<string, AnswerValue>;
};

export type SignContractResult =
  | {
      ok: true;
      asset: Asset;
      contractId: string;
      quoteId: string;
      applicationId: string;
    }
  | {
      ok: false;
      reason: 'not_found' | 'reservation_conflict' | 'asset_not_available' | 'invalid_contract';
    };

class ContractConflictError extends Error {
  constructor(public readonly reason: 'reservation_conflict' | 'asset_not_available') {
    super(reason);
  }
}

/**
 * Signs a lease contract and persists `Quote`, `Application`, `Contract`, `InvoiceRow[]`,
 * and `AssetEvent` rows while transitioning the asset to `'leased'` and completing any
 * active reservation in one atomic `withAudit()` transaction.
 */
export async function signContract(
  db: PrismaClient,
  input: SignContractInput
): Promise<SignContractResult> {
  const existingRow = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!existingRow) return { ok: false, reason: 'not_found' };
  const asset = toAsset(existingRow);

  const activeReservation = await db.assetReservation.findFirst({
    where: { asset_id: input.assetId, status: 'active' },
    orderBy: { created_at: 'desc' },
  });

  if (activeReservation) {
    if (!input.token || activeReservation.token !== input.token) {
      return { ok: false, reason: 'reservation_conflict' };
    }
  } else if (input.token) {
    return { ok: false, reason: 'reservation_conflict' };
  } else if (asset.status !== 'available') {
    return { ok: false, reason: 'asset_not_available' };
  }

  const signedOn = input.signedOn ?? todayIso();
  const [priceLists, coefficientTable, vatRates, questionsFile] = await Promise.all([
    readPriceLists(db),
    readCoefficientTable(db),
    readVatRates(db),
    readQuestions(db),
  ]);

  const currentPrice = effectiveAssetPriceOn(priceLists, asset, signedOn);
  if (!currentPrice.ok) return { ok: false, reason: 'invalid_contract' };

  const isOffer =
    activeReservation?.reservation_type === 'offer' &&
    activeReservation.list_price_cents !== null &&
    activeReservation.price_list_version !== null;

  const quoteResult =
    isOffer && activeReservation
      ? calculateQuoteWithOffer({
          offerTerms: {
            listPriceCents: activeReservation.list_price_cents!,
            priceListVersion: activeReservation.price_list_version!,
            termMonths: input.termMonths,
            downPaymentCents: input.downPaymentCents,
            monthlyNetRentCents: activeReservation.monthly_net_rent_cents ?? 0,
            monthlyGrossRentCents: activeReservation.monthly_gross_rent_cents ?? 0,
            buyoutNetCents: activeReservation.buyout_net_cents ?? 0,
            offeredOn: activeReservation.offered_on ?? signedOn,
          },
          currentListPriceCents: currentPrice.priceCents,
          currentPriceListVersion: currentPrice.priceListVersion,
          asOfDate: signedOn,
          expiresAt: activeReservation.expires_at,
          coefficientTable,
          vatRates,
        }).quoteResult
      : calculateContractQuote({
          listPriceCents: currentPrice.priceCents,
          priceListVersion: currentPrice.priceListVersion,
          downPaymentCents: input.downPaymentCents,
          termMonths: input.termMonths,
          isoDate: signedOn,
          coefficientTable,
          vatRates,
        });

  if (!quoteResult.ok) return { ok: false, reason: 'invalid_contract' };
  const { quote } = quoteResult;

  const schedule = generateInvoiceSchedule({
    signedOn,
    termMonths: quote.termMonths,
    monthlyNetRentCents: quote.monthlyNetRentCents,
    vatRates,
    downPaymentCents: quote.downPaymentCents,
  });

  const downVatCents =
    quote.downPaymentCents > 0
      ? Math.round((quote.downPaymentCents * schedule.signingVatRatePercent) / 100)
      : 0;
  const downGrossCents = quote.downPaymentCents + downVatCents;
  const totalNetCents = quote.downPaymentCents + schedule.totalNetRentCents;
  const totalGrossCents =
    (quote.downPaymentCents > 0 ? downGrossCents : 0) + schedule.totalGrossCents;

  const storedPriceListVersion = currentPrice.isRelisted ? null : quote.priceListVersion;
  const matchedPriceList =
    storedPriceListVersion !== null
      ? priceLists.find((p) => p.version === storedPriceListVersion)
      : undefined;

  const rawAnswers = input.answers ?? {};
  const customerType = rawAnswers['q_customer_type'];
  const { kept: keptAnswers } = pruneAnswers(questionsFile.questions, {
    deal: {
      category: asset.category,
      financed_amount_cents: quote.financedCents,
      term_months: quote.termMonths,
      ...(typeof customerType === 'string' ? { customer_type: customerType } : {}),
    },
    answers: rawAnswers,
  });

  const factorPpm = fractionToPpm(quote.factor);
  const annualInterestBp = percentToBp(quote.band.annual_interest_percent);

  try {
    return await withAudit(
      db,
      {
        actor: input.actor,
        action: 'contract.signed',
        entityType: 'asset',
        entityId: asset.id,
        details: {
          from: asset.status,
          to: 'leased',
          signedOn,
          termMonths: quote.termMonths,
          downPaymentCents: quote.downPaymentCents,
          listPriceCents: quote.listPriceCents,
          priceListVersion: storedPriceListVersion,
          monthlyNetRentCents: quote.monthlyNetRentCents,
          buyoutNetCents: quote.buyoutNetCents,
          totalNetCents,
          totalGrossCents,
          ...(activeReservation ? { token: activeReservation.token } : {}),
        },
      },
      async (tx) => {
        const expectedStatus = activeReservation ? 'reserved' : 'available';
        const { count } = await tx.asset.updateMany({
          where: { id: asset.id, status: expectedStatus },
          data: {
            status: 'leased',
            ...(asset.first_lease_date === undefined ? { first_lease_date: signedOn } : {}),
            ...(asset.first_list_price_cents === undefined
              ? { first_list_price_cents: quote.listPriceCents }
              : {}),
          },
        });
        if (count === 0) {
          throw new ContractConflictError(
            activeReservation ? 'reservation_conflict' : 'asset_not_available'
          );
        }

        if (activeReservation) {
          await tx.assetReservation.update({
            where: { id: activeReservation.id },
            data: { status: 'completed' },
          });
        }

        // Ensure PriceList FK target exists even in test DBs that only seeded assets.
        if (matchedPriceList) {
          await tx.priceList.upsert({
            where: { version: matchedPriceList.version },
            create: {
              version: matchedPriceList.version,
              valid_from: matchedPriceList.valid_from,
              valid_to: matchedPriceList.valid_to,
              note: matchedPriceList.note,
            },
            update: {},
          });
        }

        const createdQuote = await tx.quote.create({
          data: {
            asset_id: asset.id,
            created_on: activeReservation?.offered_on ?? signedOn,
            price_list_version: storedPriceListVersion,
            list_price_cents: quote.listPriceCents,
            down_payment_cents: quote.downPaymentCents,
            financed_cents: quote.financedCents,
            band: quote.band.band,
            factor_ppm: factorPpm,
            annual_interest_bp: annualInterestBp,
            term_months: quote.termMonths,
            monthly_net_rent_cents: quote.monthlyNetRentCents,
            buyout_net_cents: quote.buyoutNetCents,
          },
        });

        const createdApp = await tx.application.create({
          data: {
            quote_id: createdQuote.id,
            created_on: signedOn,
            answers_json: JSON.stringify(keptAnswers),
            decision: 'yes',
            reasons_json: '[]',
            status: 'signed',
          },
        });

        const createdContract = await tx.contract.create({
          data: {
            application_id: createdApp.id,
            quote_id: createdQuote.id,
            asset_id: asset.id,
            status: 'active',
            start_date: signedOn,
            price_list_version: storedPriceListVersion,
            list_price_cents: quote.listPriceCents,
            down_payment_cents: quote.downPaymentCents,
            financed_cents: quote.financedCents,
            band: quote.band.band,
            factor_ppm: factorPpm,
            annual_interest_bp: annualInterestBp,
            term_months: quote.termMonths,
            monthly_net_rent_cents: quote.monthlyNetRentCents,
            buyout_net_cents: quote.buyoutNetCents,
            total_net_cents: totalNetCents,
            total_gross_cents: totalGrossCents,
            signed_on: signedOn,
          },
        });

        const invoiceRowsData: {
          contract_id: string;
          seq: number;
          kind: string;
          invoice_date: string;
          period_start: string;
          period_end: string;
          net_cents: number;
          vat_rate_bp: number;
          vat_cents: number;
          gross_cents: number;
        }[] = [];

        if (quote.downPaymentCents > 0) {
          invoiceRowsData.push({
            contract_id: createdContract.id,
            seq: 0,
            kind: 'down_payment',
            invoice_date: signedOn,
            period_start: signedOn,
            period_end: signedOn,
            net_cents: quote.downPaymentCents,
            vat_rate_bp: percentToBp(schedule.signingVatRatePercent),
            vat_cents: downVatCents,
            gross_cents: downGrossCents,
          });
        }

        const seqOffset = quote.downPaymentCents > 0 ? 1 : 0;
        for (let idx = 0; idx < schedule.invoices.length; idx += 1) {
          const inv = schedule.invoices[idx]!;
          const nextStart = addMonthsClamped(signedOn, idx + 1);
          invoiceRowsData.push({
            contract_id: createdContract.id,
            seq: seqOffset + idx,
            kind: 'rent',
            invoice_date: inv.dueDate,
            period_start: inv.dueDate,
            period_end: subtractOneDayIso(nextStart),
            net_cents: inv.netRentCents,
            vat_rate_bp: percentToBp(inv.vatRatePercent),
            vat_cents: inv.vatCents,
            gross_cents: inv.grossTotalCents,
          });
        }

        await tx.invoiceRow.createMany({ data: invoiceRowsData });

        await tx.assetEvent.create({
          data: {
            asset_id: asset.id,
            on_date: signedOn,
            from_status: asset.status,
            to_status: 'leased',
            contract_id: createdContract.id,
            condition: asset.condition,
            usage_value: asset.usage.value,
            amount_cents: quote.listPriceCents,
            note_key: 'passport.event.leased',
          },
        });

        const updatedAsset = await tx.asset.findUniqueOrThrow({ where: { id: asset.id } });
        return {
          ok: true as const,
          asset: toAsset(updatedAsset),
          contractId: createdContract.id,
          quoteId: createdQuote.id,
          applicationId: createdApp.id,
        };
      }
    );
  } catch (error) {
    if (error instanceof ContractConflictError) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }
}

export type PersistedContractView = {
  contractId: string;
  status: string;
  signedOn: string;
  quote: ContractQuote;
  schedule: InvoiceSchedule;
};

/**
 * Loads a persisted `Contract` and its stored `InvoiceRow` schedule from SQLite if one matches
 * the requested `contractId` or `(assetId, termMonths, downPaymentCents, signedOn?)`.
 */
export async function findPersistedContract(
  db: PrismaClient,
  input: {
    contractId?: string;
    assetId: string;
    termMonths: number;
    downPaymentCents: number;
    signedOn?: string;
  }
): Promise<PersistedContractView | null> {
  const row = input.contractId
    ? await db.contract.findUnique({
        where: { id: input.contractId },
        include: { invoiceRows: { orderBy: { seq: 'asc' } } },
      })
    : await db.contract.findFirst({
        where: {
          asset_id: input.assetId,
          term_months: input.termMonths,
          down_payment_cents: input.downPaymentCents,
          ...(input.signedOn ? { signed_on: input.signedOn } : {}),
        },
        orderBy: { created_at: 'desc' },
        include: { invoiceRows: { orderBy: { seq: 'asc' } } },
      });

  if (!row || row.asset_id !== input.assetId) return null;

  const rentRows = row.invoiceRows.filter((r) => r.kind === 'rent');
  const firstRentRow = rentRows[0];
  const signingVatRatePercent = firstRentRow ? bpToPercent(firstRentRow.vat_rate_bp) : 25.5;
  const firstRentVatCents =
    firstRentRow?.vat_cents ??
    Math.round((row.monthly_net_rent_cents * signingVatRatePercent) / 100);
  const buyoutPercent =
    row.financed_cents > 0 ? Math.round((row.buyout_net_cents * 100) / row.financed_cents) : 0;

  const invoices: MonthlyInvoice[] = rentRows.map((r, index) => {
    const vatRatePercent = bpToPercent(r.vat_rate_bp);
    return {
      invoiceNumber: index + 1,
      dueDate: r.invoice_date,
      netRentCents: r.net_cents,
      vatRatePercent,
      vatRateFictional: r.invoice_date >= '2027-01-01',
      vatCents: r.vat_cents,
      grossTotalCents: r.gross_cents,
      isVatChangedFromSigning: vatRatePercent !== signingVatRatePercent,
      signingVatRatePercent,
    };
  });

  const totalNetRentCents = invoices.reduce((sum, inv) => sum + inv.netRentCents, 0);
  const totalVatCents = invoices.reduce((sum, inv) => sum + inv.vatCents, 0);
  const totalGrossCents = invoices.reduce((sum, inv) => sum + inv.grossTotalCents, 0);

  const quote: ContractQuote = {
    isoDate: row.signed_on,
    listPriceCents: row.list_price_cents,
    priceListVersion: row.price_list_version ?? 1,
    downPaymentCents: row.down_payment_cents,
    financedCents: row.financed_cents,
    termMonths: row.term_months,
    band: {
      band: row.band,
      min_financed_cents: 0,
      max_financed_cents: row.financed_cents,
      annual_interest_percent: bpToPercent(row.annual_interest_bp),
      monthly_factor_by_term: { [String(row.term_months)]: ppmToFraction(row.factor_ppm) },
    },
    factor: ppmToFraction(row.factor_ppm),
    monthlyNetRentCents: row.monthly_net_rent_cents,
    vatRatePercent: signingVatRatePercent,
    vatRateFictional: row.signed_on >= '2027-01-01',
    monthlyVatCents: firstRentVatCents,
    monthlyGrossRentCents: row.monthly_net_rent_cents + firstRentVatCents,
    buyoutPercent,
    buyoutNetCents: row.buyout_net_cents,
    totalRentNetCents: totalNetRentCents,
    totalRentGrossCents: totalGrossCents,
    totalLeaseNetCents: row.down_payment_cents + totalNetRentCents,
    totalWithBuyoutNetCents: row.down_payment_cents + totalNetRentCents + row.buyout_net_cents,
  };

  return {
    contractId: row.id,
    status: row.status,
    signedOn: row.signed_on,
    quote,
    schedule: {
      signedOn: row.signed_on,
      termMonths: row.term_months,
      monthlyNetRentCents: row.monthly_net_rent_cents,
      signingVatRatePercent,
      invoices,
      totalNetRentCents,
      totalVatCents,
      totalGrossCents,
    },
  };
}
