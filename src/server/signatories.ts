// The company's signatories and the signing link (D46). Owns the `CompanySignatory` and
// `SignatureRequest` tables. A case that waits for the company's signatory gets a signing link
// inside the same transaction; the signatory opens it (in production: Suomi.fi identification
// and an e-mailed invitation; here: the demo outbox on the decision page) and signs or
// declines. Every write is in withAudit; a token signing is recorded as `signatory:<email>`.
import { randomBytes } from 'node:crypto';
import type {
  CompanySignatory as SignatoryRow,
  SignatureRequest as RequestRow,
} from '@/generated/prisma/client';
import type { Customer } from '@/data/schemas';
import {
  activeSignatories,
  normaliseEmail,
  requestExpiresOn,
  requestOutcome,
  revoke,
  signingCheck,
  type Mandate,
  type RequestOutcome,
} from '@/domain/signatories/mandates';
import {
  REGISTER_CHECK_SIMULATED,
  companySignatoryRowSchema,
  companySignatoryValidityUpdateSchema,
  signatoryEmailSchema,
  signatureRequestAnswerSchema,
  signatureRequestRowSchema,
} from '@/domain/rows/signatory';
import { can, type AuthzRefusal } from '@/domain/authz/policy';
import { signingActionSchema, type SigningAction } from './signatory-schemas';
import { ADMIN_ACTOR } from './actor';
import { recordSignatoryDecision, type ApplicationView } from './applications';
import { withAudit, type TransactionClient } from './audit';
import { authorize } from './authorize';
import { getCustomer } from './customers';
import type { PrismaClient } from './prisma-client';
import { parseRow } from './row-rules';

export type SignatoryState = 'active' | 'waiting_for_link' | 'not_yet_valid' | 'ended';

export type SignatoryView = {
  id: string;
  customerId: string;
  name: string;
  email: string;
  grantedBy: string;
  grantedOn: string;
  validFrom: string | null;
  validTo: string | null;
  /** On the day asked for. */
  state: SignatoryState;
};

const mandateOf = (row: SignatoryRow): Mandate => ({
  id: row.id,
  email: row.email,
  validFrom: row.valid_from,
  validTo: row.valid_to,
});

function stateOn(row: SignatoryRow, today: string): SignatoryState {
  if (activeSignatories([mandateOf(row)], today).length === 1) return 'active';
  if (row.valid_from === null) return 'waiting_for_link';
  if (row.valid_to !== null && row.valid_to <= today) return 'ended';
  return 'not_yet_valid';
}

function toView(row: SignatoryRow, today: string): SignatoryView {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    email: row.email,
    grantedBy: row.granted_by,
    grantedOn: row.granted_on,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    state: stateOn(row, today),
  };
}

const rowsOf = (db: PrismaClient | TransactionClient, customerId: string) =>
  db.companySignatory.findMany({
    where: { customer_id: customerId },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });

/** The company's signatory list with each entry's state on `today`. */
export async function listSignatories(
  db: PrismaClient,
  customerId: string,
  today: string
): Promise<SignatoryView[]> {
  return (await rowsOf(db, customerId)).map((row) => toView(row, today));
}

/**
 * The data pack has no signatory list: for every company whose applicant can sign, the
 * company's own name and e-mail is its signatory, as the register check would find, valid
 * from the seed day. A company whose applicant cannot sign (Norvi, card 6) gets none: its
 * signatory comes from the signing link. Adds only what is missing.
 */
export async function seedSignatories(
  db: PrismaClient,
  customers: readonly Customer[],
  today: string
): Promise<{ created: number; skipped: number }> {
  const companies = customers.filter((c) => c.type === 'company' && c.applicant_can_sign);
  const existing = await db.companySignatory.findMany({ select: { customer_id: true } });
  const listed = new Set(existing.map((row) => row.customer_id));
  const missing = companies.filter((c) => !listed.has(c.id));
  if (missing.length > 0) {
    await db.companySignatory.createMany({
      data: missing.map((c) =>
        parseRow('company_signatory', companySignatoryRowSchema, {
          customer_id: c.id,
          name: c.name,
          email: c.email,
          granted_by: REGISTER_CHECK_SIMULATED,
          granted_on: today,
          valid_from: today,
          valid_to: null,
        })
      ),
    });
  }
  return { created: missing.length, skipped: companies.length - missing.length };
}

/**
 * Who may change a company's list (D73, `manage_signatories`), checked before anything else:
 * the admin (the bank's back office, from the register), or the company's own account when
 * its e-mail is an active signatory on the list, who grants the right. An account that may not
 * sign itself (Norvi's coordinator) may not grant it: that would be the same hole as signing.
 */
async function granterFor(
  db: PrismaClient,
  customerId: string,
  actor: string,
  today: string
): Promise<
  | { ok: true; customer: Customer; grantedBy: string }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal }
> {
  const auth = await authorize(db, actor, 'manage_signatories', { customer: customerId });
  if (!auth.ok) {
    return auth.reason.code === 'not_found'
      ? { ok: false, reason: 'not_found' }
      : { ok: false, reason: 'forbidden', refusal: auth.reason };
  }
  const customer = await getCustomer(db, customerId);
  if (!customer || customer.type !== 'company') return { ok: false, reason: 'not_found' };
  if (actor === ADMIN_ACTOR) return { ok: true, customer, grantedBy: REGISTER_CHECK_SIMULATED };
  const mandates = (await rowsOf(db, customerId)).map(mandateOf);
  const decision = can(actor, 'manage_signatories', {
    customerId,
    mandates,
    signerEmail: customer.email,
    onDate: today,
  });
  if (!decision.ok) return { ok: false, reason: 'forbidden', refusal: decision.reason };
  const own = activeSignatories(mandates, today).find(
    (m) => m.email === normaliseEmail(customer.email)
  );
  return own
    ? { ok: true, customer, grantedBy: own.id }
    : {
        ok: false,
        reason: 'forbidden',
        refusal: { code: 'signatory_required', params: { action: 'manage_signatories' } },
      };
}

export type AddSignatoryInput = {
  customerId: string;
  name: string;
  email: string;
  validFrom: string;
  validTo: string | null;
  actor: string;
  today: string;
};

export type AddSignatoryResult =
  | { ok: true; signatory: SignatoryView }
  | { ok: false; reason: 'not_found' | 'already_listed' | 'invalid_dates' }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal };

export async function addSignatory(
  db: PrismaClient,
  input: AddSignatoryInput
): Promise<AddSignatoryResult> {
  const granter = await granterFor(db, input.customerId, input.actor, input.today);
  if (!granter.ok) return granter;
  if (input.validTo !== null && input.validTo <= input.validFrom) {
    return { ok: false, reason: 'invalid_dates' };
  }
  const email = signatoryEmailSchema.parse(input.email);
  const listed = (await rowsOf(db, input.customerId)).some(
    (row) => row.email === email && stateOn(row, input.today) !== 'ended'
  );
  if (listed) return { ok: false, reason: 'already_listed' };
  const data = parseRow('company_signatory', companySignatoryRowSchema, {
    customer_id: input.customerId,
    name: input.name,
    email,
    granted_by: granter.grantedBy,
    granted_on: input.today,
    valid_from: input.validFrom,
    valid_to: input.validTo,
  });
  const row = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'company_signatory.added',
      entityType: 'company_signatory',
      entityId: input.customerId,
      details: {
        email,
        grantedBy: granter.grantedBy,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
    },
    (tx) => tx.companySignatory.create({ data })
  );
  return { ok: true, signatory: toView(row, input.today) };
}

export type RevokeSignatoryResult =
  | { ok: true; signatory: SignatoryView }
  | { ok: false; reason: 'not_found' | 'already_ended' | 'last_signatory' }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal };

/** Ends a signatory's right on `today` (D46); the last active one cannot be revoked. */
export async function revokeSignatory(
  db: PrismaClient,
  input: { customerId: string; signatoryId: string; actor: string; today: string }
): Promise<RevokeSignatoryResult> {
  const granter = await granterFor(db, input.customerId, input.actor, input.today);
  if (!granter.ok) return granter;
  const rows = await rowsOf(db, input.customerId);
  const result = revoke(rows.map(mandateOf), input.signatoryId, input.today);
  if (!result.ok) return { ok: false, reason: result.code };
  const data = parseRow('company_signatory', companySignatoryValidityUpdateSchema, {
    valid_from: result.mandate.validFrom,
    valid_to: result.mandate.validTo,
  });
  const row = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'company_signatory.revoked',
      entityType: 'company_signatory',
      entityId: input.signatoryId,
      details: { customerId: input.customerId, validTo: result.mandate.validTo },
    },
    (tx) => tx.companySignatory.update({ where: { id: input.signatoryId }, data })
  );
  return { ok: true, signatory: toView(row, input.today) };
}

/**
 * The list entry a signing link for `email` goes to (wave 3 finding 3): a revoked and re-added
 * e-mail has two entries, and the link goes to the one that has not ended on `today` (active,
 * waiting for its link or not yet valid), the ended one only when there is no other.
 */
export function entryForLink<R extends SignatoryRow>(
  rows: readonly R[],
  email: string,
  today: string
): R | undefined {
  const same = rows.filter((row) => row.email === email);
  return same.find((row) => stateOn(row, today) !== 'ended') ?? same[0];
}

/**
 * Inside the transaction that puts a case into `awaiting_signatory`: the signing link for the
 * named e-mail. An e-mail not on the list becomes an entry waiting for its link (granted by
 * the simulated register check, no `valid_from`): a stranger's address signs nothing until
 * the link is opened, and the audit shows when it was.
 */
export async function createSignatureRequest(
  tx: TransactionClient,
  input: { applicationId: string; customerId: string; email: string; today: string }
): Promise<{ requestId: string; signatoryId: string; registered: boolean }> {
  const email = signatoryEmailSchema.parse(input.email);
  const found = entryForLink(await rowsOf(tx, input.customerId), email, input.today);
  const signatory =
    found ??
    (await tx.companySignatory.create({
      data: parseRow('company_signatory', companySignatoryRowSchema, {
        customer_id: input.customerId,
        name: email,
        email,
        granted_by: REGISTER_CHECK_SIMULATED,
        granted_on: input.today,
        valid_from: null,
        valid_to: null,
      }),
    }));
  const request = await tx.signatureRequest.create({
    data: parseRow('signature_request', signatureRequestRowSchema, {
      application_id: input.applicationId,
      signatory_id: signatory.id,
      token: randomBytes(24).toString('base64url'),
      sent_on: input.today,
      expires_on: requestExpiresOn(input.today),
    }),
  });
  return { requestId: request.id, signatoryId: signatory.id, registered: found === undefined };
}

export type SigningLinkView = {
  token: string;
  applicationId: string;
  customerId: string;
  signatoryName: string;
  signatoryEmail: string;
  sentOn: string;
  expiresOn: string;
  outcome: RequestOutcome;
};

const daysOf = (row: RequestRow) => ({
  expiresOn: row.expires_on,
  signedOn: row.signed_on,
  declinedOn: row.declined_on,
});

function toLinkView(row: RequestRow & { signatory: SignatoryRow }, today: string): SigningLinkView {
  return {
    token: row.token,
    applicationId: row.application_id,
    customerId: row.signatory.customer_id,
    signatoryName: row.signatory.name,
    signatoryEmail: row.signatory.email,
    sentOn: row.sent_on,
    expiresOn: row.expires_on,
    outcome: requestOutcome(daysOf(row), today),
  };
}

/** The link sent for an application most recently (the decision page's demo outbox). */
export async function latestSigningLink(
  db: PrismaClient,
  applicationId: string,
  today: string
): Promise<SigningLinkView | null> {
  const row = await db.signatureRequest.findFirst({
    where: { application_id: applicationId },
    orderBy: [{ sent_on: 'desc' }, { id: 'desc' }],
    include: { signatory: true },
  });
  return row ? toLinkView(row, today) : null;
}

/** The state of a signing link on `today`, or null for a token nobody was sent. */
export async function getSigningLink(
  db: PrismaClient,
  token: string,
  today: string
): Promise<SigningLinkView | null> {
  const row = await db.signatureRequest.findUnique({
    where: { token },
    include: { signatory: true },
  });
  return row ? toLinkView(row, today) : null;
}

export type SignByTokenResult =
  | { ok: true; application: ApplicationView; registered: boolean }
  | {
      ok: false;
      reason: 'not_found' | 'expired' | 'already_used' | 'signatory_not_active' | 'not_pending';
    };

/** Thrown inside the transaction when the link or the case changed under us. */
class LostSigningRace extends Error {}

/**
 * The signatory signs (approved) or declines (rejected) through the link on `today` (D46).
 * Opening a link to an entry still waiting brings it into force from today. The link, the
 * entry and the case change in one transaction with one audit row whose actor is
 * `signatory:<email>`; a second use answers `already_used` and writes nothing.
 */
export async function decideByToken(
  db: PrismaClient,
  input: { token: string; action: SigningAction; today: string }
): Promise<SignByTokenResult> {
  const action = signingActionSchema.parse(input.action);
  const row = await db.signatureRequest.findUnique({
    where: { token: input.token },
    include: { signatory: true },
  });
  if (!row) return { ok: false, reason: 'not_found' };
  const check = signingCheck(daysOf(row), mandateOf(row.signatory), input.today);
  if (!check.ok) return { ok: false, reason: check.code };

  const email = row.signatory.email;
  const decision = action === 'sign' ? 'approved' : 'rejected';
  const answer = parseRow('signature_request', signatureRequestAnswerSchema, {
    opened_on: input.today,
    signed_on: action === 'sign' ? input.today : null,
    declined_on: action === 'decline' ? input.today : null,
  });
  try {
    const application = await withAudit(
      db,
      {
        actor: `signatory:${email}`,
        action: 'application.decided',
        entityType: 'application',
        entityId: row.application_id,
        details: {
          from: 'awaiting_signatory',
          to: decision,
          by: email,
          via: 'signing_link',
          signatureRequestId: row.id,
          signatoryRegistered: check.activates,
        },
      },
      async (tx) => {
        const used = await tx.signatureRequest.updateMany({
          where: { id: row.id, signed_on: null, declined_on: null },
          data: answer,
        });
        if (used.count === 0) throw new LostSigningRace();
        if (check.activates) {
          await tx.companySignatory.update({
            where: { id: row.signatory_id },
            data: parseRow('company_signatory', companySignatoryValidityUpdateSchema, {
              valid_from: input.today,
              valid_to: null,
            }),
          });
        }
        const decided = await recordSignatoryDecision(tx, {
          id: row.application_id,
          decision,
          by: email,
          today: input.today,
        });
        if (!decided) throw new LostSigningRace();
        return decided;
      }
    );
    return { ok: true, application, registered: check.activates };
  } catch (error) {
    if (error instanceof LostSigningRace) {
      const now = await db.signatureRequest.findUnique({ where: { id: row.id } });
      return now && (now.signed_on !== null || now.declined_on !== null)
        ? { ok: false, reason: 'already_used' }
        : { ok: false, reason: 'not_pending' };
    }
    throw error;
  }
}
