import { expect, it } from 'vitest';
import { earlyReturnNet } from './exit';
it('card8 caps month7 exit at the signed end buyout without charging already elapsed rents', () => {
  expect(earlyReturnNet(10730, 36, 6, 58350)).toEqual({
    remainingRentNetCents: 321900,
    buyoutCapNetCents: 58350,
    feeNetCents: 58350,
    policy: 'EXIT_CAP_BUYOUT_V1',
  });
  expect(earlyReturnNet(10730, 36, 35, 58350).feeNetCents).toBe(10730);
  expect(earlyReturnNet(10730, 36, 36, 58350).feeNetCents).toBe(0);
  for (const elapsed of [-1, 37, 0.5])
    expect(() => earlyReturnNet(10730, 36, elapsed, 58350)).toThrow();
  expect(() => earlyReturnNet(Number.MAX_SAFE_INTEGER, 36, 0, 1)).toThrow();
});
