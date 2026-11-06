import {
  contractStatusSchema,
  endOfTermActionSchema,
  isoDateSchema,
  type ContractStatus,
  type EndOfTermAction,
} from '@/data/schemas';

export type EndOfTermInput = {
  action: EndOfTermAction;
  contractStatus: ContractStatus;
  endsOn: string;
  completedOn: string;
  outstandingRentCents: number;
  buyoutCents: number;
  buyoutPaidCents?: number;
};

export type EndOfTermFailure =
  | { ok: false; reason: 'contract_not_active'; status: ContractStatus }
  | { ok: false; reason: 'term_not_finished'; endsOn: string; completedOn: string }
  | { ok: false; reason: 'rent_balance_outstanding'; outstandingRentCents: number }
  | { ok: false; reason: 'buyout_payment_required'; expectedCents: number }
  | {
      ok: false;
      reason: 'buyout_amount_mismatch';
      expectedCents: number;
      receivedCents: number;
    }
  | { ok: false; reason: 'buyout_not_allowed' };

export type EndOfTermDecision =
  | {
      ok: true;
      action: EndOfTermAction;
      contractStatus: 'completed';
      assetStatus: 'sold' | 'returned';
      historyEvent: 'bought_out' | 'returned' | 'passed_on';
      buyoutPaidCents: number | null;
    }
  | EndOfTermFailure;

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number of cents, got ${value}`);
  }
}

function assertDate(value: string, name: string): void {
  if (!isoDateSchema.safeParse(value).success) {
    throw new RangeError(`${name} must be a valid ISO date, got "${value}"`);
  }
}

/** Decides how an active contract can finish without reading the clock or changing data. */
export function endOfTermFor(input: EndOfTermInput): EndOfTermDecision {
  const action = endOfTermActionSchema.parse(input.action);
  const contractStatus = contractStatusSchema.parse(input.contractStatus);
  assertDate(input.endsOn, 'endsOn');
  assertDate(input.completedOn, 'completedOn');
  assertCents(input.outstandingRentCents, 'outstandingRentCents');
  assertCents(input.buyoutCents, 'buyoutCents');
  if (input.buyoutPaidCents !== undefined) {
    assertCents(input.buyoutPaidCents, 'buyoutPaidCents');
  }

  if (contractStatus !== 'active')
    return { ok: false, reason: 'contract_not_active', status: contractStatus };
  if (input.completedOn < input.endsOn) {
    return {
      ok: false,
      reason: 'term_not_finished',
      endsOn: input.endsOn,
      completedOn: input.completedOn,
    };
  }
  if (input.outstandingRentCents > 0) {
    return {
      ok: false,
      reason: 'rent_balance_outstanding',
      outstandingRentCents: input.outstandingRentCents,
    };
  }

  if (action === 'bought') {
    if (input.buyoutPaidCents === undefined) {
      return { ok: false, reason: 'buyout_payment_required', expectedCents: input.buyoutCents };
    }
    if (input.buyoutPaidCents !== input.buyoutCents) {
      return {
        ok: false,
        reason: 'buyout_amount_mismatch',
        expectedCents: input.buyoutCents,
        receivedCents: input.buyoutPaidCents,
      };
    }
    return {
      ok: true,
      action,
      contractStatus: 'completed',
      assetStatus: 'sold',
      historyEvent: 'bought_out',
      buyoutPaidCents: input.buyoutPaidCents,
    };
  }

  if (input.buyoutPaidCents !== undefined) return { ok: false, reason: 'buyout_not_allowed' };

  return {
    ok: true,
    action,
    contractStatus: 'completed',
    assetStatus: 'returned',
    historyEvent: action === 'passed_on' ? 'passed_on' : 'returned',
    buyoutPaidCents: null,
  };
}
