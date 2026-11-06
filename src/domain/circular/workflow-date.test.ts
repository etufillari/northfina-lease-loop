import { describe, expect, it } from 'vitest';
import { latestLifecycleDate } from './workflow-date';

describe('latestLifecycleDate', () => {
  it('uses the latest lifecycle milestone when the demo clock is earlier', () => {
    expect(latestLifecycleDate('2026-11-06', '2028-11-06', null)).toBe('2028-11-06');
  });

  it('keeps the current date when all milestones are earlier', () => {
    expect(latestLifecycleDate('2029-01-01', '2028-11-06')).toBe('2029-01-01');
  });
});
