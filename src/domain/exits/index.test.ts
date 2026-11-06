import { describe, expect, it } from 'vitest';
import * as exits from './index';

describe('exits index', () => {
  it('exports the D14 cost, the exit plan, the billing rule and the leasable condition', () => {
    expect(typeof exits.earlyExitCost).toBe('function');
    expect(typeof exits.planExit).toBe('function');
    expect(typeof exits.exitBilling).toBe('function');
    expect(exits.LEASABLE_CONDITION).toBe('good');
  });
});
