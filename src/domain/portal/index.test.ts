import { describe, expect, it } from 'vitest';
import * as portal from './index';

describe('portal index', () => {
  it('exports the invoice overview and the exit choices', () => {
    expect(typeof portal.groupInvoices).toBe('function');
    expect(typeof portal.endOfTermChoices).toBe('function');
  });
});
