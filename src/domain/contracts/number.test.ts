import { describe, expect, it } from 'vitest';
import { contractNumber } from './number';

describe('contractNumber', () => {
  it('is LL-, the signing day without dashes and the last 8 characters of the application id', () => {
    expect(contractNumber('2026-11-05', 'cmh3x0abc0000def12345xyz')).toBe('LL-20261105-12345XYZ');
  });

  it('uses the whole id when it is shorter than 8 characters', () => {
    expect(contractNumber('2026-11-06', 'app-1')).toBe('LL-20261106-APP-1');
  });

  it('differs for two applications signed the same day', () => {
    expect(contractNumber('2026-11-05', 'aaaa0001')).not.toBe(
      contractNumber('2026-11-05', 'aaaa0002')
    );
  });

  it('throws on a day that is not a real ISO day or an empty id', () => {
    expect(() => contractNumber('2026-02-30', 'app-1')).toThrow();
    expect(() => contractNumber('2026-11-05', '')).toThrow();
  });
});
