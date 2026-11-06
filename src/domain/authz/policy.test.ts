// D73: the actor × action table. Card 6 (Norvi's four e-bikes, awaiting the signatory) is the
// case the signatory rows pin: the coordinator and the admin never sign for the company.
import { describe, expect, it } from 'vitest';
import type { Mandate } from '@/domain/signatories/mandates';
import { ADMIN, ANONYMOUS, AUTHZ_ACTIONS, can, isAuthzRefusal, type AuthzAction } from './policy';

const OWN = 'cust-norvi';
const OTHER = 'cust-aino';
const subjectFor = (action: AuthzAction) =>
  ['assess_asset', 'read_second_life', 'set_asset_status', 'run_demo_card'].includes(action)
    ? { customerId: null }
    : { customerId: OWN };

const codeOf = (actor: string, action: AuthzAction) => {
  const decision = can(actor, action, subjectFor(action));
  return decision.ok ? 'ok' : decision.reason.code;
};

// Every (actor kind × action) with the expected answer.
const TABLE: Record<
  AuthzAction,
  { anonymous: string; owner: string; other: string; admin: string }
> = {
  read_application: { anonymous: 'not_signed_in', owner: 'ok', other: 'not_owner', admin: 'ok' },
  apply: { anonymous: 'not_signed_in', owner: 'ok', other: 'not_owner', admin: 'ok' },
  decide_application: {
    anonymous: 'not_signed_in',
    owner: 'admin_only',
    other: 'admin_only',
    admin: 'ok',
  },
  // Panu's finding: the customer signs their own lease; the admin reviews, never signs.
  sign_contract: {
    anonymous: 'not_signed_in',
    owner: 'ok',
    other: 'not_owner',
    admin: 'customer_signs',
  },
  // Cancelling an application not signed yet: the customer, or the admin for them.
  withdraw_application: {
    anonymous: 'not_signed_in',
    owner: 'ok',
    other: 'not_owner',
    admin: 'ok',
  },
  read_contract: { anonymous: 'not_signed_in', owner: 'ok', other: 'not_owner', admin: 'ok' },
  pay_invoice: { anonymous: 'not_signed_in', owner: 'ok', other: 'not_owner', admin: 'ok' },
  exit_contract: { anonymous: 'not_signed_in', owner: 'ok', other: 'not_owner', admin: 'ok' },
  read_leases: { anonymous: 'not_signed_in', owner: 'ok', other: 'not_owner', admin: 'ok' },
  manage_signatories: {
    anonymous: 'not_signed_in',
    owner: 'ok',
    other: 'not_owner',
    admin: 'ok',
  },
  read_signatories: { anonymous: 'not_signed_in', owner: 'ok', other: 'not_owner', admin: 'ok' },
  assess_asset: {
    anonymous: 'not_signed_in',
    owner: 'admin_only',
    other: 'admin_only',
    admin: 'ok',
  },
  // D85: the second-life page shows the whole waiting list (other customers' budgets and needs).
  read_second_life: {
    anonymous: 'not_signed_in',
    owner: 'admin_only',
    other: 'admin_only',
    admin: 'ok',
  },
  set_asset_status: {
    anonymous: 'not_signed_in',
    owner: 'admin_only',
    other: 'admin_only',
    admin: 'ok',
  },
  run_demo_card: { anonymous: 'ok', owner: 'ok', other: 'ok', admin: 'ok' },
};

describe('can: every actor kind × every action', () => {
  it('the table covers every action', () => {
    expect(Object.keys(TABLE).sort()).toEqual([...AUTHZ_ACTIONS].sort());
  });

  for (const action of AUTHZ_ACTIONS) {
    it(`${action}`, () => {
      const row = TABLE[action];
      expect({
        anonymous: codeOf(ANONYMOUS, action),
        owner: codeOf(OWN, action),
        other: codeOf(OTHER, action),
        admin: codeOf(ADMIN, action),
      }).toEqual(row);
    });
  }

  it('D85: only the admin reads the second life; an unknown or empty actor is refused', () => {
    const asset = { customerId: null };
    expect(can(ADMIN, 'read_second_life', asset)).toEqual({ ok: true });
    expect(can('cust-nobody', 'read_second_life', asset)).toMatchObject({
      ok: false,
      reason: { code: 'admin_only', params: { action: 'read_second_life' } },
    });
    expect(can('', 'read_second_life', asset)).toMatchObject({
      ok: false,
      reason: { code: 'not_signed_in' },
    });
  });

  it('names the action in the refusal params', () => {
    expect(can(OTHER, 'pay_invoice', { customerId: OWN })).toEqual({
      ok: false,
      reason: { code: 'not_owner', params: { action: 'pay_invoice' } },
    });
  });

  it('an empty actor reads as not signed in', () => {
    expect(codeOf('', 'apply')).toBe('not_signed_in');
  });

  it('a customer acting on a record with no owner is not the owner', () => {
    const decision = can(OWN, 'read_contract', { customerId: null });
    expect(decision.ok ? 'ok' : decision.reason.code).toBe('not_owner');
  });
});

const board: Mandate = {
  id: 'sig-1',
  email: 'board@norvi.example.com',
  validFrom: '2026-01-01',
  validTo: null,
};
const revoked: Mandate = {
  id: 'sig-2',
  email: 'cfo@norvi.example.com',
  validFrom: '2026-01-01',
  validTo: '2026-11-01',
};
const waiting = { customerId: OWN, awaitingSignatory: true, mandates: [board, revoked] };

describe('can: card 6, a case awaiting the company signatory (D46)', () => {
  for (const action of ['sign_contract', 'decide_application'] as const) {
    it(`${action}: the coordinator, the admin and anonymous are refused`, () => {
      for (const actor of [OWN, ADMIN, ANONYMOUS, OTHER]) {
        const decision = can(actor, action, waiting);
        expect(decision.ok ? 'ok' : decision.reason.code).toBe('signatory_required');
      }
    });

    it(`${action}: an active mandate through the link signs`, () => {
      const subject = { ...waiting, signerEmail: ' Board@Norvi.example.com', onDate: '2026-11-06' };
      expect(can(ANONYMOUS, action, subject)).toEqual({ ok: true });
    });

    it(`${action}: a revoked mandate does not sign on its end day`, () => {
      const subject = { ...waiting, signerEmail: revoked.email, onDate: '2026-11-01' };
      const decision = can(ANONYMOUS, action, subject);
      expect(decision.ok ? 'ok' : decision.reason.code).toBe('signatory_required');
    });

    it(`${action}: a signer without a day signs nothing`, () => {
      const subject = { ...waiting, signerEmail: board.email };
      expect(can(ANONYMOUS, action, subject).ok).toBe(false);
    });
  }
});

describe('can: the company changes its own signatory list only as an active signatory', () => {
  const list = { customerId: OWN, mandates: [board], onDate: '2026-11-06' };

  it('the company account that is an active signatory may', () => {
    expect(can(OWN, 'manage_signatories', { ...list, signerEmail: board.email })).toEqual({
      ok: true,
    });
  });

  it('the company account that is not on the list is refused', () => {
    const decision = can(OWN, 'manage_signatories', { ...list, signerEmail: 'buyer@norvi.fi' });
    expect(decision.ok ? 'ok' : decision.reason.code).toBe('signatory_required');
  });

  it('the admin needs no mandate (the register check)', () => {
    expect(can(ADMIN, 'manage_signatories', { ...list, signerEmail: 'x@y.fi' })).toEqual({
      ok: true,
    });
  });

  it('another customer is not the owner, mandate or not', () => {
    const decision = can(OTHER, 'manage_signatories', { ...list, signerEmail: board.email });
    expect(decision.ok ? 'ok' : decision.reason.code).toBe('not_owner');
  });
});

describe('isAuthzRefusal', () => {
  it('knows the four codes and nothing else', () => {
    expect(isAuthzRefusal({ code: 'not_owner' })).toBe(true);
    expect(isAuthzRefusal({ code: 'signatory_required' })).toBe(true);
    expect(isAuthzRefusal({ code: 'already_signed' })).toBe(false);
  });
});
