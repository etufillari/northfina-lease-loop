// A contract waiting for the person who must sign it (D-050), e.g. a company's authorised
// signatory when the applicant may not sign (card 6). When they sign, the contract becomes active
// from that day: only the sign and start dates change, the price stays as locked when it was sent.
// There is no e-signature service in the demo; the contract page signs as that person.
import { countersign, type Contract } from '@/domain/contract';
import { withAudit } from './audit';
import { getContract } from './contracts';
import type { PrismaClient } from './prisma-client';

export type CountersignRefusal =
  | 'contract_not_found'
  | 'not_awaiting_signature'
  | Extract<ReturnType<typeof countersign>, { ok: false }>['reason'];

export type CountersignResult =
  { ok: true; contract: Contract } | { ok: false; reason: CountersignRefusal };

/** Thrown inside the transaction to roll it back when someone else signed meanwhile. */
class AlreadySignedError extends Error {}

export async function countersignContract(
  db: PrismaClient,
  input: { contractId: number; today: string }
): Promise<CountersignResult> {
  const found = await getContract(db, input.contractId);
  if (!found) return { ok: false, reason: 'contract_not_found' };
  const { awaitingSignature } = found;
  if (!awaitingSignature) return { ok: false, reason: 'not_awaiting_signature' };
  const signed = countersign(found.contract, {
    sentOn: awaitingSignature.sentOn,
    signDate: input.today,
  });
  if (!signed.ok) return signed;
  const { contract } = signed;

  try {
    await withAudit(
      db,
      {
        // No login in the demo: the person asked to sign is the one who signs.
        actor: awaitingSignature.email,
        action: 'contract.signed_by_signatory',
        entityType: 'contract',
        entityId: String(found.id),
        details: {
          from: 'awaiting_signatory',
          to: 'active',
          assetId: contract.assetId,
          customerId: contract.customerId,
          sentOn: awaitingSignature.sentOn,
          asOf: input.today, // the effective date, which can be a demo date (D-030)
        },
      },
      async (tx) => {
        // Only a contract still waiting, so two signatures can't both win.
        const updated = await tx.contract.updateMany({
          where: { id: found.id, status: 'awaiting_signatory' },
          data: {
            status: 'active',
            sign_date: contract.signDate,
            start_date: contract.startDate,
            terms_json: JSON.stringify(contract),
          },
        });
        if (updated.count !== 1) throw new AlreadySignedError();
      }
    );
  } catch (error) {
    if (error instanceof AlreadySignedError) return { ok: false, reason: 'not_awaiting_signature' };
    throw error;
  }
  return { ok: true, contract };
}
