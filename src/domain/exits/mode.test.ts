import { describe, expect, it } from 'vitest';
import { exitModeSchema, exitModes } from './mode';

describe('exitModeSchema', () => {
  it('knows the three exits and nothing else', () => {
    expect(exitModes).toEqual(['buy', 'return', 'pass_on']);
    expect(exitModeSchema.safeParse('sell').success).toBe(false);
  });
});
