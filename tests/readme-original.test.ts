// The organiser's README (commit d3e6897) stays in ours: we may add sections, never remove or
// reword one of its lines. Same check as the upkeep's `comm -23` over the sorted non-blank
// lines. Read-only: it reads the old README from git history (CI checks out with depth 0).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ORIGINAL_COMMIT = 'd3e6897';

const nonBlankLines = (text: string): Set<string> =>
  new Set(
    text
      .split('\n')
      .map((line) => line.replace(/\r$/, ''))
      .filter((line) => line.trim() !== '')
  );

describe("the organiser's README", () => {
  it('has every line of its original version, unchanged', () => {
    let original: string;
    try {
      original = execFileSync('git', ['show', `${ORIGINAL_COMMIT}:README.md`], {
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      throw new Error(
        `Cannot read README.md at ${ORIGINAL_COMMIT}: this check needs the full git history; a shallow clone lacks it (git fetch --unshallow).`
      );
    }
    const ours = nonBlankLines(readFileSync('README.md', 'utf8'));
    const missing = [...nonBlankLines(original)].filter((line) => !ours.has(line));
    expect(missing).toEqual([]);
  });
});
