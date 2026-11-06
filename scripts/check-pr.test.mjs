import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prSections, TEAM_SECTIONS, validatePullRequest } from './check-pr.mjs';

const body = `## Summary

Customers can understand their next payment before signing.

## Context

The payment was difficult to find. No linked issue.

## Description

Show the payment beside the selected terms.

## Testing Instructions

Open the product page and adjust its term. The payment should update.
`;
const pr = { title: 'feat(pricing): show the next payment', body };

describe('PR metadata checks', () => {
  it('accepts a complete description without any checkboxes or visual signoff', () => {
    expect(validatePullRequest(pr)).toEqual([]);
  });
  it.each([
    'authentication',
    'feat: missing scope',
    'feat( ): empty scope',
    'unknown(pr): unsupported type',
    'fix(pr): ',
    'fix(pr): multiline\ntitle',
  ])('rejects an invalid title: %s', (title) => {
    expect(validatePullRequest({ ...pr, title })).toContain(
      'Use a conventional PR title: type(scope): summary.'
    );
  });
  it('accepts a breaking-change marker and an existing issue reference', () => {
    expect(validatePullRequest({ ...pr, title: 'fix(pr)!: update the format (#51)' })).toEqual([]);
  });
  it('ignores commented-out content and headings in fenced examples', () => {
    const content = body.replace(
      '## Context',
      '<!-- ## Description -->\n```md\n## Description\n```\n## Context'
    );
    expect(validatePullRequest({ ...pr, body: content })).toEqual([]);
    expect(
      validatePullRequest({
        ...pr,
        body: body.replace(
          'Customers can understand their next payment before signing.',
          '<!-- fill this in -->'
        ),
      })
    ).not.toEqual([]);
  });
  it('rejects missing, duplicate and reordered required sections', () => {
    for (const content of [
      body.replace('## Context', '## Other'),
      body + '\n## Summary\nDuplicate.',
      body
        .replace('## Context', '## Swap')
        .replace('## Description', '## Context')
        .replace('## Swap', '## Description'),
    ]) {
      expect(validatePullRequest({ ...pr, body: content })).not.toEqual([]);
    }
  });
  it('enforces the 50-word summary boundary', () => {
    const summary = 'Customers can understand their next payment before signing.';
    expect(
      validatePullRequest({ ...pr, body: body.replace(summary, Array(50).fill('word').join(' ')) })
    ).toEqual([]);
    expect(
      validatePullRequest({ ...pr, body: body.replace(summary, Array(51).fill('word').join(' ')) })
    ).toContain('Keep the Summary to at most 50 words.');
  });
  it('accepts a reasoned N/A, optional visuals and useful task lists without checking their boxes', () => {
    expect(
      validatePullRequest({
        ...pr,
        body:
          body.replace('Show the payment beside the selected terms.', 'N/A — documentation only.') +
          '\n## Screenshots / Recordings\n\n- [ ] Optional image to add later.',
      })
    ).toEqual([]);
    expect(
      validatePullRequest({
        ...pr,
        body: body.replace('Show the payment beside the selected terms.', 'N/A'),
      })
    ).not.toEqual([]);
    expect(
      validatePullRequest({
        ...pr,
        body: body.replace('Show the payment beside the selected terms.', 'N/A —'),
      })
    ).not.toEqual([]);
  });
  it('rejects empty template fields and summaries marked N/A', () => {
    expect(
      validatePullRequest({
        ...pr,
        body: body.replace(
          'The payment was difficult to find. No linked issue.',
          '**Problem:**\n\n**Related issue:**'
        ),
      })
    ).not.toEqual([]);
    expect(
      validatePullRequest({
        ...pr,
        body: body.replace(
          'Customers can understand their next payment before signing.',
          'N/A — no summary'
        ),
      })
    ).not.toEqual([]);
    expect(validatePullRequest({ ...pr, body: null })).not.toEqual([]);
  });
  it('keeps the checked-in team template aligned with the automated section requirements', () => {
    const template = readFileSync(
      new URL('../.github/pull_request_template.md', import.meta.url),
      'utf8'
    );
    expect(
      prSections(template)
        .slice(0, 4)
        .map(({ name }) => name)
    ).toEqual(TEAM_SECTIONS);
    expect(template).not.toContain('- [ ]');
  });
  it('supports the separate judging format without requiring checkbox attestations', () => {
    const template = readFileSync(
      new URL('../.github/hackathon_submission.md', import.meta.url),
      'utf8'
    );
    const submission = prSections(template)
      .map(({ name }) => `## ${name}\n\nSubmitted evidence.`)
      .join('\n\n');
    expect(
      validatePullRequest(
        { title: 'Team Loop: Lease Loop', body: submission },
        { submission: true }
      )
    ).toEqual([]);
    expect(
      validatePullRequest({ title: pr.title, body: submission }, { submission: true })
    ).not.toEqual([]);
  });
  it('reads event data through the CLI without executing title contents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lease-loop-pr-'));
    try {
      const file = join(dir, 'event.json');
      const marker = join(dir, 'must-not-exist');
      writeFileSync(
        file,
        JSON.stringify({ pull_request: { ...pr, title: `fix(pr): $(touch ${marker})` } })
      );
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('./check-pr.mjs', import.meta.url))],
        { env: { ...process.env, GITHUB_EVENT_PATH: file }, encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
      expect(existsSync(marker)).toBe(false);
      writeFileSync(file, JSON.stringify({ pull_request: { ...pr, body: '' } }));
      expect(
        spawnSync(
          process.execPath,
          [fileURLToPath(new URL('./check-pr.mjs', import.meta.url)), file],
          { encoding: 'utf8' }
        ).status
      ).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
