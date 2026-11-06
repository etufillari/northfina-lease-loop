import { describe, expect, it } from 'vitest';
import * as invoicing from './index';

describe('invoicing index', () => {
  it('exports what wave 2 builds the contract on', () => {
    for (const name of [
      'buildSchedule',
      'scheduleTotals',
      'rentPeriod',
      'hasVatRateChange',
      'outstandingBalanceAfter',
      'amortisationSchedule',
      'amortisationTolerance',
      'invoiceStatusOn',
      'contractBalanceOn',
      'addMonthsClamped',
      'addDays',
      'termEndDate',
    ]) {
      expect(typeof invoicing[name as keyof typeof invoicing], name).toBe('function');
    }
  });
});
