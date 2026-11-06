// Who may do what (D73). One pure rule for every write and every private read, checked before
// the action, never inside it: the route and the service ask `can` first and act only on
// `{ ok: true }`. There is no login (D17): the actor is `anonymous`, `admin` or a customer id.
// The public reads (catalogue, prices, quotes, passport, audit log) are not actions here; the
// second-life page is back office (D85: it shows the whole waiting list), so it is one.
import { canSign, type Mandate } from '@/domain/signatories/mandates';

export const ADMIN = 'admin';
export const ANONYMOUS = 'anonymous';

export const AUTHZ_ACTIONS = [
  'read_application',
  'apply',
  'decide_application',
  'sign_contract',
  'withdraw_application',
  'read_contract',
  'pay_invoice',
  'exit_contract',
  'read_leases',
  'manage_signatories',
  'read_signatories',
  'assess_asset',
  'read_second_life',
  'set_asset_status',
  'run_demo_card',
] as const;
export type AuthzAction = (typeof AUTHZ_ACTIONS)[number];

/**
 * Only what a rule needs. `customerId`: whose record it is (null for an asset or a demo card).
 * `awaitingSignatory`: the application waits for the company's signatory (D46). `mandates`,
 * `signerEmail` and `onDate`: the company's signatory list, who signs and the day, for the
 * rules that ask whether that e-mail holds an active mandate (`canSign`).
 */
export type AuthzSubject = {
  customerId: string | null;
  awaitingSignatory?: boolean;
  mandates?: readonly Mandate[];
  signerEmail?: string;
  onDate?: string;
};

export type AuthzRefusalCode =
  'not_signed_in' | 'not_owner' | 'admin_only' | 'signatory_required' | 'customer_signs';
export type AuthzRefusal = { code: AuthzRefusalCode; params: { action: AuthzAction } };
export type AuthzDecision = { ok: true } | { ok: false; reason: AuthzRefusal };

export const AUTHZ_REFUSAL_CODES: readonly AuthzRefusalCode[] = [
  'not_signed_in',
  'not_owner',
  'admin_only',
  'signatory_required',
  'customer_signs',
];

/** Whether a service's refusal is one of ours (the routes map it with `forbiddenResponse`). */
export function isAuthzRefusal(reason: { code: string }): reason is AuthzRefusal {
  return (AUTHZ_REFUSAL_CODES as readonly string[]).includes(reason.code);
}

const ALLOW: AuthzDecision = { ok: true };
const refuse = (code: AuthzRefusalCode, action: AuthzAction): AuthzDecision => ({
  ok: false,
  reason: { code, params: { action } },
});

/** The admin's actions that no customer takes. */
const ADMIN_ONLY: readonly AuthzAction[] = [
  'decide_application',
  'assess_asset',
  'read_second_life',
  'set_asset_status',
];

/** Whether the signer named in the subject holds an active mandate on its day (D46). */
function signerHoldsMandate(subject: AuthzSubject): boolean {
  const { mandates, signerEmail, onDate } = subject;
  return (
    mandates !== undefined &&
    signerEmail !== undefined &&
    onDate !== undefined &&
    canSign(mandates, signerEmail, onDate)
  );
}

/**
 * The rule, in order:
 * 1. `run_demo_card` is the demo tool: open to everyone while the demo tools are on (D74), as
 *    the runner acts as each card's own customer through the services, which check again.
 * 2. A case waiting for the company's signatory is signed or decided only by an active mandate
 *    through the signing link: never by the coordinator, never by the admin
 *    (`signatory_required`).
 * 3. Anonymous: `not_signed_in`.
 * 4. Changing a company's signatory list takes an account that is itself an active signatory
 *    when the subject carries the list (the admin checks the register instead).
 * 5. The customer signs their own lease: the admin reviews applications and may apply on a
 *    customer's behalf (D47), but never signs for them (`customer_signs`, D88).
 * 6. The admin does everything else; a customer never takes an admin action (`admin_only`).
 * 7. A customer acts on its own records only (`not_owner`).
 */
export function can(actor: string, action: AuthzAction, subject: AuthzSubject): AuthzDecision {
  if (action === 'run_demo_card') return ALLOW;
  const signing = action === 'sign_contract' || action === 'decide_application';
  if (signing && subject.awaitingSignatory) {
    return signerHoldsMandate(subject) ? ALLOW : refuse('signatory_required', action);
  }
  if (actor === ANONYMOUS || actor === '') return refuse('not_signed_in', action);
  if (actor === ADMIN) return action === 'sign_contract' ? refuse('customer_signs', action) : ALLOW;
  if (ADMIN_ONLY.includes(action)) return refuse('admin_only', action);
  if (subject.customerId === null || subject.customerId !== actor) {
    return refuse('not_owner', action);
  }
  if (action === 'manage_signatories' && subject.mandates !== undefined) {
    return signerHoldsMandate(subject) ? ALLOW : refuse('signatory_required', action);
  }
  return ALLOW;
}
