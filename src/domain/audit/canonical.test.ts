// The canonical form the audit chain hashes (docs/features/audit-chain.md): one value, one string.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical';

describe('canonicalJson', () => {
  it('sorts object keys recursively and prints no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[1,2]},"b":1}'
    );
  });

  it('gives one string for the same value in two key orders', () => {
    const one = { actor: 'admin', details: { to: 'reserved', from: 'available' } };
    const two = { details: { from: 'available', to: 'reserved' }, actor: 'admin' };
    expect(canonicalJson(one)).toBe(canonicalJson(two));
  });

  it('keeps arrays in their order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('drops undefined object values and prints undefined array items as null, as JSON does', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });

  it('prints numbers, booleans and null as JSON prints them', () => {
    expect(canonicalJson(12_345)).toBe('12345');
    expect(canonicalJson(-0.5)).toBe('-0.5');
    expect(canonicalJson(1e21)).toBe('1e+21');
    expect(canonicalJson(Number.NaN)).toBe('null');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
  });

  it('round-trips a string with unicode, quotes and a newline', () => {
    const text = 'Hyvä "Kettu" – åäö €\n🚲';
    const printed = canonicalJson({ text });
    expect(JSON.parse(printed)).toEqual({ text });
  });

  it('prints a Date through toJSON, as the stored JSON does', () => {
    expect(canonicalJson({ at: new Date('2026-11-05T12:00:00.000Z') })).toBe(
      '{"at":"2026-11-05T12:00:00.000Z"}'
    );
  });

  it('agrees with JSON.parse(JSON.stringify(x)) for stored details', () => {
    const details = { z: [1, { y: 'ä', x: null }], a: 0 };
    expect(canonicalJson(JSON.parse(JSON.stringify(details)))).toBe(canonicalJson(details));
  });

  it('refuses a value JSON cannot hold', () => {
    expect(() => canonicalJson(BigInt(1))).toThrow();
  });
});
