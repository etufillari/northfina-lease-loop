/**
 * Commit messages follow Conventional Commits: `type(optional-scope): subject`.
 * Examples: `feat(pricing): add factor lookup`, `fix(ui): show VAT on the price`.
 * Used by the commit-msg hook and by CI. Merge and revert messages are ignored.
 */
/**
 * Four squash merges from the first hours, before the commit rules were enforced in CI. They
 * are part of `main`'s history, and rewriting shared history to rename them would change every
 * later commit, so they are accepted by exact title. Every newer commit must follow the rules.
 */
const legacyTitles = new Set([
  'authentication (#7)',
  'Dashboard for leased items (#11)',
  '18 implement return refurbishment and second life pricing (#63)',
  'Customer lease flows (#64)',
]);

const config = {
  extends: ['@commitlint/config-conventional'],
  defaultIgnores: true,
  ignores: [(message) => legacyTitles.has(message.split('\n')[0].trim())],
  helpUrl: 'https://www.conventionalcommits.org/en/v1.0.0/',
  rules: {
    // Only the header is strict: bodies and footers may hold long lines.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    // Allow "feat: Add X" as well as "feat: add X".
    'subject-case': [0],
  },
};

export default config;
