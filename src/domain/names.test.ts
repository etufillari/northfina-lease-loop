import { describe, expect, it } from 'vitest';
import { checkCompanyName, checkPersonName, signerMatchesApplicant } from './names';

describe('signerMatchesApplicant', () => {
  it('accepts the same name, ignoring case, extra spaces and the kind of apostrophe', () => {
    for (const signed of [
      'Aino Virtanen',
      'aino virtanen',
      '  Aino   Virtanen ',
      'AINO VIRTANEN',
    ]) {
      expect(signerMatchesApplicant(signed, 'Aino Virtanen'), signed).toBe(true);
    }
    expect(signerMatchesApplicant('Seán O’Brien', "Seán O'Brien")).toBe(true);
    // The same letter written as one code point or as a letter plus an accent
    expect(signerMatchesApplicant('Mäkelä', 'Mäkelä')).toBe(true);
  });

  it('refuses a different or partial name, and a name without its accents', () => {
    for (const signed of ['Aino', 'Virtanen', 'Aino Virtane', 'Mikko Virtanen', 'Virtanen Aino']) {
      expect(signerMatchesApplicant(signed, 'Aino Virtanen'), signed).toBe(false);
    }
    expect(signerMatchesApplicant('Sanna Makela', 'Sanna Mäkelä')).toBe(false);
  });

  it('accepts any name when the application has no person’s name (a company)', () => {
    expect(signerMatchesApplicant('Norvi CEO', undefined)).toBe(true);
    expect(signerMatchesApplicant('Norvi CEO', '  ')).toBe(true);
  });
});

describe('checkPersonName', () => {
  it('accepts names from many countries, with or without a space', () => {
    for (const name of [
      'Aino Virtanen',
      'Sanna Mäkelä',
      'Lena Tamm',
      'Suharto',
      '王五',
      'Анна Тамм',
      'Anna-Liisa Mäkelä-Tamm',
      "Seán O'Brien",
      'Seán O’Brien',
      'Martin Luther King Jr.',
      '  Aino Virtanen  ',
    ]) {
      expect(checkPersonName(name), name).toBeNull();
    }
  });

  it('refuses a single letter or no letters at all', () => {
    for (const name of ['A', 'Ö', '王', '', '   ', "-'.", 'A.']) {
      expect(checkPersonName(name), JSON.stringify(name)).toBe('too_short');
    }
  });

  it('refuses digits and symbols', () => {
    for (const name of ['Aino 2', 'R2D2', 'aino@example.com', 'Aino_Virtanen', 'Aino!']) {
      expect(checkPersonName(name), name).toBe('not_a_name');
    }
  });

  it('refuses more than 100 characters, counting characters, not bytes', () => {
    expect(checkPersonName('Ä'.repeat(100))).toBeNull();
    expect(checkPersonName('Ä'.repeat(101))).toBe('too_long');
    expect(checkPersonName('王'.repeat(100))).toBeNull();
  });
});

describe('checkCompanyName', () => {
  it('accepts company names with digits and symbols', () => {
    for (const name of [
      'Norvi Logistics Oy',
      '3M Oy',
      '7-Eleven',
      'AT&T',
      'Kettu Koodi Oy',
      'Oy',
    ]) {
      expect(checkCompanyName(name), name).toBeNull();
    }
  });

  it('refuses fewer than two letters or digits', () => {
    for (const name of ['X', '7', '', '  ', '&-.']) {
      expect(checkCompanyName(name), JSON.stringify(name)).toBe('too_short');
    }
  });

  it('refuses more than 150 characters', () => {
    expect(checkCompanyName('a'.repeat(150))).toBeNull();
    expect(checkCompanyName('a'.repeat(151))).toBe('too_long');
  });
});
