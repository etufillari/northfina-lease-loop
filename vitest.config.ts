import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    globalSetup: ['./tests/global-setup.ts'],
    // Strip GIT_* inherited from Git hooks so tests can't write to this repository.
    setupFiles: ['./tests/isolate-git-env.mjs'],
    coverage: {
      provider: 'v8',
      // Business logic and server code must stay tested; UI pages are not measured.
      include: ['src/domain/**', 'src/server/**', 'src/data/**', 'src/i18n/**'],
      exclude: ['**/*.test.ts', '**/*.json', '**/*.md'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 60, functions: 60, branches: 60, statements: 60 },
    },
  },
});
