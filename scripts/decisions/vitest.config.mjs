import { defineConfig } from 'vitest/config';
// Standalone tooling tests need no Prisma database or application global setup.
// The setup file strips GIT_* inherited from Git hooks so fixture repositories stay isolated.
export default defineConfig({
  test: {
    include: ['scripts/decisions/*.test.mjs'],
    setupFiles: ['./tests/isolate-git-env.mjs'],
  },
});
