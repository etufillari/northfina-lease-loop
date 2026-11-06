// Check PR metadata as data: never interpolate a title or body into a shell command.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TEAM_SECTIONS = ['Summary', 'Context', 'Description', 'Testing Instructions'];
const SUBMISSION_SECTIONS = [
  'Team',
  'What we built',
  'The Spine',
  'Smart Problems we picked (at least 2)',
  'Scenario cards that work',
  'How to run the demo',
  'Engineering',
  'Anything else the judges should know?',
];
const TYPES = 'feat|fix|test|refactor|docs|style|chore|ci|perf';
const TITLE = new RegExp(`^(?:${TYPES})\\([^()\\r\\n]+\\)!?: \\S[^\\r\\n]*$`);

/** Ignore commented/fenced headings, while retaining code blocks as section content. */
export function prSections(body) {
  const visible = body.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  const sections = [];
  let current;
  let fence;
  for (const line of visible.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      current?.lines.push(line);
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = undefined;
      continue;
    }
    if (marker) {
      fence = marker[1];
      current?.lines.push(line);
      continue;
    }
    const heading = /^ {0,3}##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { name: heading[1], lines: [] };
      sections.push(current);
    } else current?.lines.push(line);
  }
  return sections.map(({ name, lines }) => ({ name, content: lines.join('\n').trim() }));
}

/** Objective structure checks only; no manual checkboxes or claims about review quality. */
export function validatePullRequest(pr, { submission = false } = {}) {
  const problems = [];
  const title = typeof pr?.title === 'string' ? pr.title : '';
  const body = typeof pr?.body === 'string' ? pr.body : '';
  if (
    submission
      ? !/^Team [^:\r\n]+: \S[^\r\n]*$/.test(title)
      : !TITLE.test(title) || /\(\s+\)/.test(title)
  )
    problems.push(
      submission
        ? 'Use the judging title: Team <name>: <your product name>.'
        : 'Use a conventional PR title: type(scope): summary.'
    );
  const required = submission ? SUBMISSION_SECTIONS : TEAM_SECTIONS;
  const sections = prSections(body);
  if (sections[0]?.name !== required[0]) problems.push(`Start the PR body with ## ${required[0]}.`);
  let previous = -1;
  for (const name of required) {
    const matches = sections.filter((section) => section.name === name);
    if (matches.length !== 1) {
      problems.push(`Include exactly one ## ${name} section.`);
      continue;
    }
    const index = sections.indexOf(matches[0]);
    if (index < previous) problems.push(`Keep ## ${name} in template order.`);
    previous = index;
    const content = matches[0].content;
    if (!/[\p{L}\p{N}]/u.test(content)) problems.push(`Fill ## ${name}, or explain why it is N/A.`);
    if (
      !submission &&
      /^N\/A\b/i.test(content) &&
      !/[\p{L}\p{N}]/u.test(content.replace(/^N\/A\b/i, ''))
    )
      problems.push(`Explain why ## ${name} is N/A.`);
  }
  if (!submission) {
    const summary = sections.find(({ name }) => name === 'Summary')?.content ?? '';
    if (summary.split(/\s+/u).filter(Boolean).length > 50)
      problems.push('Keep the Summary to at most 50 words.');
    if (/^N\/A\b/i.test(summary))
      problems.push('Describe the change in Summary; it cannot be N/A.');
    if (
      /^\s*(?:\d+\.\s*)?\*\*(?:Problem|Related issue|Setup|Action|Expected result|Relevant edge cases):\*\*\s*$/m.test(
        body
      )
    )
      problems.push('Replace empty template fields with information or an N/A explanation.');
  }
  return problems;
}

export function main(args = process.argv.slice(2), env = process.env) {
  const file = args[0] ?? env.GITHUB_EVENT_PATH;
  if (!file) {
    console.error('Usage: npm run check:pr -- <GitHub event JSON file>');
    return 1;
  }
  let event;
  try {
    event = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.error('Cannot read the PR event JSON file.');
    return 1;
  }
  if (!event?.pull_request) {
    console.error('Expected a pull_request event.');
    return 1;
  }
  const headRepository = event.pull_request.head?.repo?.full_name;
  const submission =
    event.repository?.full_name === 'etufillari/northfina-lease-loop' &&
    typeof headRepository === 'string' &&
    headRepository !== event.repository.full_name;
  const problems = validatePullRequest(event.pull_request, { submission });
  if (problems.length) {
    for (const problem of problems) console.error(`PR metadata: ${problem}`);
    return 1;
  }
  console.log('PR title and description structure passed. No checklist ticks are required.');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
