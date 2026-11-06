import { describe, expect, it } from 'vitest';
import { context, judgingRun } from './cli.mjs';

describe('decision tooling context', () => {
  it('uses DECISIONS_REPOSITORY over GITHUB_REPOSITORY for the records’ PRs', () => {
    expect(
      context({
        DECISIONS_REPOSITORY: 'Tiisetso/northfina-lease-loop',
        GITHUB_REPOSITORY: 'etufillari/northfina-lease-loop',
      }).repository
    ).toBe('Tiisetso/northfina-lease-loop');
    expect(context({ GITHUB_REPOSITORY: 'Tiisetso/northfina-lease-loop' }).repository).toBe(
      'Tiisetso/northfina-lease-loop'
    );
  });
  it('treats a run in another repository as the judging PR', () => {
    const fork = 'Tiisetso/northfina-lease-loop';
    expect(
      judgingRun({
        DECISIONS_REPOSITORY: fork,
        GITHUB_REPOSITORY: 'etufillari/northfina-lease-loop',
      })
    ).toBe(true);
    expect(judgingRun({ DECISIONS_REPOSITORY: fork, GITHUB_REPOSITORY: fork })).toBe(false);
    expect(judgingRun({ GITHUB_REPOSITORY: fork })).toBe(false);
  });
});
