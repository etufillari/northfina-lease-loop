import { expect, it } from 'vitest';
import { netFromGross } from './gross-money';
it('converts inclusive quotes into integer net cents', () => {
  expect(netFromGross(12550, 2550)).toBe(10000);
  expect(netFromGross(10000, 0)).toBe(10000);
  expect(() => netFromGross(-1, 2550)).toThrow();
});
