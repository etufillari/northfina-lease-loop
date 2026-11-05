import { describe, expect, it } from 'vitest';
import { POST } from './route';

// The handler is a plain function over Request, so it can be tested without a server.
function post(body: unknown, raw?: string) {
  const request = new Request('http://localhost/api/applications/evaluate', {
    method: 'POST',
    body: raw ?? JSON.stringify(body),
  });
  return POST(request, undefined);
}

const deal = { category: 'e_bike', financed_amount_cents: 389_000, term_months: 36 };

describe('POST /api/applications/evaluate', () => {
  it('asks the always-on and category questions and is incomplete when nothing is answered', async () => {
    const response = await post({ deal, answers: {} });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.questions.map((q: { id: string }) => q.id)).toEqual([
      'q_customer_type',
      'q_email',
      'q_usage_purpose', // the deal is an e-bike
    ]);
    expect(json.data.decision.decision).toBe('incomplete');
  });

  it('reads the customer type from the first answer and shows its questions', async () => {
    const json = await (await post({ deal, answers: { q_customer_type: 'consumer' } })).json();
    expect(json.data.questions.map((q: { id: string }) => q.id)).toContain('q_birth_date');
  });

  it('refuses a minor on the contract start date (card 5)', async () => {
    const json = await (
      await post({
        deal,
        answers: { q_customer_type: 'consumer', q_birth_date: '2009-03-10' },
        contract_start_date: '2026-11-05',
      })
    ).json();
    expect(json.data.decision.decision).toBe('no');
    expect(json.data.decision.reasons[0].rule).toBe('min_age');
  });

  it('reports the answers it dropped when the deal no longer needs them', async () => {
    const json = await (
      await post({
        deal,
        answers: { q_customer_type: 'consumer', q_pep: 'yes', q_pep_details: 'x' },
      })
    ).json();
    expect(json.data.dropped).toEqual(['q_pep', 'q_pep_details']);
    expect(json.data.answers).toEqual({ q_customer_type: 'consumer' });
  });

  it('answers with the validation envelope for a bad body', async () => {
    const response = await post({ deal: { ...deal, term_months: 0 }, answers: {} });
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects fractional cents and unknown fields', async () => {
    const fractional = await post({ deal: { ...deal, financed_amount_cents: 100.5 }, answers: {} });
    expect(fractional.status).toBe(400);
    const extra = await post({ deal, answers: {}, nope: true });
    expect(extra.status).toBe(400);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await post(undefined, '{not json');
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });
});
