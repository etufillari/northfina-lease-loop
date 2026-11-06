// Product review finding 5: a refused decision or signing-link answer shows its own sentence.
import { describe, expect, it } from 'vitest';
import { failureText, responseFailureText, type FailureLabels } from './api-failure';

const labels: FailureLabels = {
  error: 'Something went wrong.',
  APPLICATION_NOT_PENDING: 'Already decided.',
  SIGNING_LINK_USED: 'This link was used.',
  not_signed_in: 'Pick who you are first.',
};

describe('failureText', () => {
  it('writes the sentence for the envelope code (card 6: a second click on a used link)', () => {
    const body = { error: { code: 'SIGNING_LINK_USED', message: 'x' } };
    expect(failureText(body, labels)).toBe('This link was used.');
  });

  it('prefers the authorization code in details over FORBIDDEN (D74)', () => {
    const body = { error: { code: 'FORBIDDEN', details: { code: 'not_signed_in' } } };
    expect(failureText(body, labels)).toBe('Pick who you are first.');
  });

  it('falls back to the generic sentence for an unknown code, no code or no body', () => {
    expect(failureText({ error: { code: 'SOMETHING_NEW' } }, labels)).toBe('Something went wrong.');
    expect(failureText({}, labels)).toBe('Something went wrong.');
    expect(failureText(null, labels)).toBe('Something went wrong.');
    expect(failureText('not an envelope', labels)).toBe('Something went wrong.');
  });

  it('never takes an inherited name for a code', () => {
    expect(failureText({ error: { code: 'toString' } }, labels)).toBe('Something went wrong.');
  });
});

describe('responseFailureText', () => {
  it('reads the code from a 409 response', async () => {
    const response = new Response(JSON.stringify({ error: { code: 'APPLICATION_NOT_PENDING' } }), {
      status: 409,
    });
    expect(await responseFailureText(response, labels)).toBe('Already decided.');
  });

  it('a body that is not JSON is the generic sentence, never a throw', async () => {
    const response = new Response('<html>gateway</html>', { status: 502 });
    expect(await responseFailureText(response, labels)).toBe('Something went wrong.');
  });
});
