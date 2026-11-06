import { describe, expect, it } from 'vitest';
import { signatoryFailure, signingFailure } from './signatory-responses';

async function envelope(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe('signatoryFailure', () => {
  it('the last signatory is a 409 LAST_SIGNATORY in the fail() envelope', async () => {
    expect(await envelope(signatoryFailure({ ok: false, reason: 'last_signatory' }))).toMatchObject(
      {
        status: 409,
        body: { success: false, error: { code: 'LAST_SIGNATORY' } },
      }
    );
  });

  it('a stranger is a 403 FORBIDDEN (D74); an unknown company a 404', async () => {
    const refusal = { code: 'not_owner', params: { action: 'manage_signatories' } } as const;
    const forbidden = await envelope(signatoryFailure({ ok: false, reason: 'forbidden', refusal }));
    expect(forbidden).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } });
    expect(
      (await envelope(signatoryFailure({ ok: false, reason: 'not_found' }))).body.error.code
    ).toBe('SIGNATORY_NOT_FOUND');
  });
});

describe('signingFailure', () => {
  it.each([
    ['not_found', 404, 'SIGNING_LINK_NOT_FOUND'],
    ['expired', 410, 'SIGNING_LINK_EXPIRED'],
    ['already_used', 409, 'SIGNING_LINK_USED'],
    ['signatory_not_active', 403, 'SIGNATORY_NOT_ACTIVE'],
    ['not_pending', 409, 'APPLICATION_NOT_PENDING'],
  ] as const)('%s → %i %s, no raw message beyond the fixed one', async (reason, status, code) => {
    const { status: got, body } = await envelope(signingFailure(reason));
    expect(got).toBe(status);
    expect(body).toMatchObject({ success: false, error: { code } });
    expect(Object.keys(body.error)).toEqual(['code', 'message']);
  });
});
