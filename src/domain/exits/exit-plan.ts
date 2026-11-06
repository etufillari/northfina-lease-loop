// Planning an exit: buy out, return or pass on (D14, D16, D22). Pure: the server reads the
// rows, this decides what to write, the server writes it in one `withAudit`.
//
// The contract status (the rule for `ended_early`):
// - on or after the end date (its last day): `bought`, `returned` or `passed_on` by the mode;
// - before it, whatever the mode: `ended_early`. A buy before the end is still a buy (the
//   event is CONTRACT_BOUGHT_OUT and the asset is sold), but the contract did not run its term.
// `ended_on` is the exit day in both cases.
//
// The bill (see early-exit.ts for the amounts):
// - a buy issues one invoice: kind `buyout` on or after the end (the frozen buyout), kind
//   `early_exit` before it (the D14 balance);
// - a return or pass-on before the end issues one `early_exit` invoice for its cost;
// - a return or pass-on on or after the end issues none: the cost shown is the refurbishment,
//   and the invoice kinds have no refurbishment charge (docs/features/exits.md, open questions);
// - an amount of zero is not a refusal, but no invoice is issued for it.
// The invoice is issued and due on the exit day, VAT by the rate in force that day (D2).
//
// The rents cancelled: before the end, every unpaid rent. The D14 balance after the paid rents
// already contains every rent not paid, so keeping one, even an overdue one, would bill it
// twice. Paid rents (paid in advance too) stay paid and count in the balance. On or after the
// end nothing is cancelled: the buyout and the refurbishment do not replace a rent.
//
// D23: the mode, the reason, the condition and the contract's status are parsed with their
// schemas before use; a bad value throws.
import { assetConditionSchema, type AssetCondition, type VatRates } from '@/data/schemas';
import {
  contractBoughtOutSchema,
  returnReasonSchema,
  unitPassedOnSchema,
  unitReturnedSchema,
  type DomainEvent,
} from '../events';
import { splitVat } from '../money-math';
import { conditionRank } from '../second-life/assess';
import {
  contractStatusSchema,
  invoiceKindSchema,
  invoiceStatusSchema,
  type ContractStatus,
  type InvoiceKind,
} from '../statuses';
import { vatRateOn } from '../vat';
import {
  earlyExitCost,
  LEASABLE_CONDITION,
  type EarlyExitCost,
  type EarlyExitInput,
} from './early-exit';
import { exitModeSchema, type ExitMode } from './mode';

export type ExitReason = 'end_of_term' | 'early_exit';

export type ExitInvoice = {
  kind: InvoiceKind;
  issueDate: string;
  dueDate: string;
  netCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  grossCents: number;
};

export type ExitInvoiceRow = { id: string; kind: string; status: string };

export type ExitRefusal =
  | { code: 'contract_not_active'; params: { status: ContractStatus } }
  | { code: 'not_started'; params: { startDate: string } }
  | { code: 'pass_on_needs_next_customer'; params: Record<string, never> }
  | { code: 'next_customer_is_self'; params: { customerId: string } }
  | {
      code: 'pass_on_below_leasable';
      params: { condition: AssetCondition; needed: AssetCondition };
    }
  | { code: 'reason_mismatch'; params: { reason: ExitReason; endDate: string } }
  | { code: 'usage_unit_mismatch'; params: { unit: string; expected: string } }
  | { code: 'usage_below_signing'; params: { value: number; atSigning: number; unit: string } }
  | { code: 'no_vat_rate_on_date'; params: { isoDate: string } };

export type PlanExitInput = Omit<EarlyExitInput, 'invoices' | 'reported'> & {
  contract: EarlyExitInput['contract'] & {
    id: string;
    customerId: string;
    assetId: string;
    status: string;
  };
  mode: string;
  reason?: string;
  reported: { condition: string; usage: EarlyExitInput['reported']['usage'] };
  nextCustomerId?: string;
  /** The asset as it was leased (its row is not written during the lease): D77 checks the
   *  report against it. */
  atSigning: { condition: string; usage: EarlyExitInput['reported']['usage'] };
  invoices: readonly ExitInvoiceRow[];
  vatRates: VatRates;
};

export type PlannedExit = {
  mode: ExitMode;
  reason: ExitReason;
  status: ContractStatus;
  endedOn: string;
  event: DomainEvent;
  invoice: ExitInvoice | null;
  cancelInvoiceIds: string[];
  cost: EarlyExitCost;
};

export type PlanExitResult = { ok: true; plan: PlannedExit } | { ok: false; reason: ExitRefusal };

/** Invoices as the cost wants them, every kind and status parsed (D23). */
function parsedInvoices(invoices: readonly ExitInvoiceRow[]) {
  return invoices.map((invoice) => ({
    id: invoice.id,
    kind: invoiceKindSchema.parse(invoice.kind),
    status: invoiceStatusSchema.parse(invoice.status),
  }));
}

export type ExitBillingInput = {
  mode: ExitMode;
  cost: EarlyExitCost;
  today: string;
  invoices: readonly ExitInvoiceRow[];
  vatRates: VatRates;
};

export type ExitBilling =
  | { ok: true; invoice: ExitInvoice | null; cancelInvoiceIds: string[] }
  | { ok: false; reason: Extract<ExitRefusal, { code: 'no_vat_rate_on_date' }> };

/** The invoice an exit issues and the rents it cancels (the rules at the top of this file). */
export function exitBilling(input: ExitBillingInput): ExitBilling {
  const { mode, cost, today } = input;
  const cancelInvoiceIds = cost.atOrAfterEnd
    ? []
    : parsedInvoices(input.invoices)
        .filter((invoice) => invoice.kind === 'rent' && invoice.status === 'issued')
        .map((invoice) => invoice.id);

  const billed = mode === 'buy' || !cost.atOrAfterEnd;
  // D90: a pass-on bills the return without the refurbishment.
  const netCents =
    mode === 'buy'
      ? cost.buy.totalCents
      : mode === 'pass_on'
        ? cost.passOn.totalCents
        : cost.return.totalCents;
  if (!billed || netCents === 0) return { ok: true, invoice: null, cancelInvoiceIds };

  const rate = vatRateOn(input.vatRates, today);
  if (!rate.ok)
    return { ok: false, reason: { code: 'no_vat_rate_on_date', params: { isoDate: today } } };
  const split = splitVat(netCents, rate.rateBasisPoints);
  return {
    ok: true,
    cancelInvoiceIds,
    invoice: {
      kind: cost.atOrAfterEnd ? 'buyout' : 'early_exit',
      issueDate: today,
      dueDate: today,
      netCents: split.netCents,
      vatRateBasisPoints: rate.rateBasisPoints,
      vatCents: split.vatCents,
      grossCents: split.grossCents,
    },
  };
}

const STATUS_AT_END: Record<ExitMode, ContractStatus> = {
  buy: 'bought',
  return: 'returned',
  pass_on: 'passed_on',
};

/** What an exit on `today` does: the status, the event, the invoice and the cancelled rents. */
export function planExit(input: PlanExitInput): PlanExitResult {
  const mode = exitModeSchema.parse(input.mode);
  const status = contractStatusSchema.parse(input.contract.status);
  // D77: the customer's word is taken only where it is no better than the item at signing; the
  // assessment's inspection decides the rest (review finding 2).
  const conditionAtSigning = assetConditionSchema.parse(input.atSigning.condition);
  const reportedCondition = assetConditionSchema.parse(input.reported.condition);
  const condition =
    conditionRank(reportedCondition) > conditionRank(conditionAtSigning)
      ? conditionAtSigning
      : reportedCondition;
  const { contract, today } = input;

  if (status !== 'active') {
    return { ok: false, reason: { code: 'contract_not_active', params: { status } } };
  }
  if (today < contract.startDate) {
    return {
      ok: false,
      reason: { code: 'not_started', params: { startDate: contract.startDate } },
    };
  }
  if (mode === 'pass_on' && !input.nextCustomerId) {
    return { ok: false, reason: { code: 'pass_on_needs_next_customer', params: {} } };
  }
  if (mode === 'pass_on' && input.nextCustomerId === contract.customerId) {
    return {
      ok: false,
      reason: { code: 'next_customer_is_self', params: { customerId: contract.customerId } },
    };
  }
  // D90 (review 2): a pass-on relists the item as it is, without refurbishment, so only an item
  // at least `good` (LEASABLE_CONDITION) may go straight to the next person; else return it.
  if (mode === 'pass_on' && conditionRank(condition) < conditionRank(LEASABLE_CONDITION)) {
    return {
      ok: false,
      reason: {
        code: 'pass_on_below_leasable',
        params: { condition, needed: LEASABLE_CONDITION },
      },
    };
  }
  const atOrAfterEnd = today >= contract.endDate;
  const reason: ExitReason = atOrAfterEnd ? 'end_of_term' : 'early_exit';
  if (input.reason !== undefined && returnReasonSchema.parse(input.reason) !== reason) {
    return {
      ok: false,
      reason: { code: 'reason_mismatch', params: { reason, endDate: contract.endDate } },
    };
  }
  const expectedUnit = input.curves.usage_adjustment[input.asset.category]?.unit;
  if (expectedUnit && input.reported.usage.unit !== expectedUnit) {
    return {
      ok: false,
      reason: {
        code: 'usage_unit_mismatch',
        params: { unit: input.reported.usage.unit, expected: expectedUnit },
      },
    };
  }

  if (input.reported.usage.value < input.atSigning.usage.value) {
    return {
      ok: false,
      reason: {
        code: 'usage_below_signing',
        params: {
          value: input.reported.usage.value,
          atSigning: input.atSigning.usage.value,
          unit: input.reported.usage.unit,
        },
      },
    };
  }

  const invoices = parsedInvoices(input.invoices);
  const reported = { condition, usage: input.reported.usage };
  const cost = earlyExitCost({ ...input, invoices, reported });
  const billing = exitBilling({ mode, cost, today, invoices, vatRates: input.vatRates });
  if (!billing.ok) return billing;

  const common = { contractId: contract.id, assetId: contract.assetId, date: today };
  const back = { ...common, reason, condition, usage: reported.usage };
  const event: DomainEvent =
    mode === 'buy'
      ? contractBoughtOutSchema.parse({
          type: 'CONTRACT_BOUGHT_OUT',
          ...common,
          amountCents: cost.buy.totalCents,
        })
      : mode === 'return'
        ? unitReturnedSchema.parse({ type: 'UNIT_RETURNED', ...back })
        : unitPassedOnSchema.parse({
            type: 'UNIT_PASSED_ON',
            ...back,
            nextCustomerId: input.nextCustomerId,
          });

  return {
    ok: true,
    plan: {
      mode,
      reason,
      status: atOrAfterEnd ? STATUS_AT_END[mode] : 'ended_early',
      endedOn: today,
      event,
      invoice: billing.invoice,
      cancelInvoiceIds: billing.cancelInvoiceIds,
      cost,
    },
  };
}
