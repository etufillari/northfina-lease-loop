// Signing by the company's named signatory (scenario card 6). The signatory has no account here:
// they open a link that carries a token, an HMAC of the contract ID with the server's auth secret.
// Nothing extra is stored, the token can't be guessed, and it only works for its own contract.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { AWAITING_SIGNATURE, signatorySigning } from '@/domain/signatory';
import { ApiError, ok, readJsonBody } from './api-response';
import { withAudit } from './audit';
import { authSettings, type AuthSettings } from './auth-config';
import { assertSameOrigin } from './auth-input';
import { requestToday } from './demo-mode';

export function signingToken(secret: string, contractId: string): string {
  return createHmac('sha256', secret).update(`lease-loop-signing:${contractId}`).digest('hex');
}

export function validSigningToken(secret: string, contractId: string, token: unknown): boolean {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(signingToken(secret, contractId)));
}

/** The link the customer sends to their signatory. */
export function signingLink(settings: AuthSettings, locale: string, contractId: string): string {
  const token = signingToken(settings.secret, contractId);
  return `${settings.baseURL}/${locale}/sign/${encodeURIComponent(contractId)}?token=${token}`;
}

/** What the signing page shows; null for a wrong link, so it reveals nothing. */
export async function contractForSigning(
  database: PrismaClient,
  contractId: string,
  token: unknown,
  settings: AuthSettings = authSettings()
) {
  if (!validSigningToken(settings.secret, contractId, token)) return null;
  const contract = await database.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      status: true,
      signatoryEmail: true,
      signedOn: true,
      startDate: true,
      termMonths: true,
      monthlyNetCents: true,
      downPaymentCents: true,
      buyoutCents: true,
      asset: { select: { make: true, model: true } },
      customer: { select: { owner: { select: { name: true } } } },
    },
  });
  return contract?.signatoryEmail ? contract : null;
}

const signSchema = z.strictObject({ token: z.string().max(128), confirm: z.literal(true) });

/**
 * POST { token, confirm: true } signs the contract as its named signatory: it becomes active and
 * billing starts on the signing day. The audit trail names the signatory as the actor.
 */
export async function signAsSignatory(
  database: PrismaClient,
  request: Request,
  contractId: string,
  settings: AuthSettings = authSettings()
): Promise<Response> {
  assertSameOrigin(request, settings);
  const { token } = await readJsonBody(request, signSchema);
  if (!validSigningToken(settings.secret, contractId, token))
    throw new ApiError(404, 'NOT_FOUND', 'This signing link is not valid.');
  const today = requestToday(request);
  const contract = await database.contract.findUnique({
    where: { id: contractId },
    select: { status: true, startDate: true, signatoryEmail: true },
  });
  if (!contract?.signatoryEmail)
    throw new ApiError(404, 'NOT_FOUND', 'This signing link is not valid.');
  return withAudit(
    database,
    {
      actor: `signatory:${contract.signatoryEmail}`,
      action: 'contract.signed_by_signatory',
      entityType: 'contract',
      entityId: contractId,
      details: { signedOn: today },
    },
    async (tx) => {
      // Re-read inside the transaction so two clicks can't both sign.
      const current = await tx.contract.findUnique({
        where: { id: contractId },
        select: { status: true, startDate: true },
      });
      const signing = current ? signatorySigning(current, today) : null;
      if (!signing?.ok)
        throw new ApiError(409, 'ALREADY_SIGNED', 'This contract is no longer waiting.');
      await tx.contract.updateMany({
        where: { id: contractId, status: AWAITING_SIGNATURE },
        data: { status: 'active', startDate: signing.startDate, signedOn: signing.signedOn },
      });
      await tx.leaseEvent.create({
        data: { contractId, kind: 'signed', eventDate: signing.signedOn },
      });
      return ok(
        { status: 'active', startDate: signing.startDate },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
  );
}
