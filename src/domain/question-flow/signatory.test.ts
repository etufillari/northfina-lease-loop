import { describe, expect, it } from 'vitest';
import { sameEmail, whoDecides } from './signatory';

describe('sameEmail', () => {
  it('ignores case and the spaces around it', () => {
    expect(sameEmail(' Fleet@Norvi.example.com', 'fleet@norvi.example.com ')).toBe(true);
    expect(sameEmail('fleet@norvi.example.com', 'signatory@norvi.example.com')).toBe(false);
    expect(sameEmail(undefined, 'a@b.fi')).toBe(false);
    expect(sameEmail('', '')).toBe(false);
  });
});

describe('whoDecides (D10, D39, D46)', () => {
  it('a manual review is the admin’s', () => {
    expect(whoDecides('manual_review')).toBe('admin');
  });

  it('card 6: a case waiting for the signatory is decided only through the signing link', () => {
    expect(whoDecides('awaiting_signatory')).toBe('signing_link');
  });

  it('an approved or rejected case is final', () => {
    expect(whoDecides('approved')).toBe('final');
    expect(whoDecides('rejected')).toBe('final');
  });
});
