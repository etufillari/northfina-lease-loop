// ESLint flat config. Run `npm run lint` (CI fails on any warning).
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { noServerInClient } from './scripts/eslint-no-server-in-client.mjs';

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'coverage/**',
    'src/generated/**',
    'prisma/migrations/**',
    'next-env.d.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  // React and Next.js rules for the app.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [nextPlugin.configs['core-web-vitals'], reactHooks.configs.flat.recommended],
  },

  // Node scripts and config files.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // A 'use client' file runs in the browser, so it cannot import server code, wherever it is.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries: { rules: { 'no-server-in-client': noServerInClient } } },
    rules: { 'boundaries/no-server-in-client': 'error' },
  },

  // Components are the browser side, even without 'use client': a client file may import them.
  // Pages fetch data on the server and pass it down. Type-only imports are erased, so they stay.
  {
    files: ['src/components/**/*.{ts,tsx}'],
    ignores: ['src/components/**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server', '@/server/*', '@/data/load', '@/app', '@/app/*'],
              allowTypeImports: true,
              message: 'Components get data from props or fetch, not from server code.',
            },
          ],
        },
      ],
    },
  },

  // Server code does not depend on the UI.
  {
    files: ['src/server/**/*.ts'],
    ignores: ['src/server/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/components', '@/components/*', '@/app', '@/app/*', 'react', 'react-dom'],
              message: 'Server code cannot depend on the UI.',
            },
          ],
        },
      ],
    },
  },

  // The data layer only describes and loads the data pack.
  {
    files: ['src/data/**/*.ts'],
    ignores: ['src/data/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/server',
                '@/server/*',
                '@/domain',
                '@/domain/*',
                '@/components',
                '@/components/*',
                '@/app',
                '@/app/*',
              ],
              message: 'src/data depends on nothing else in the app.',
            },
          ],
        },
      ],
    },
  },

  // src/domain is pure: no I/O, no framework, no clock, no randomness.
  // Everything a function needs (data, today's date) is passed in as an argument.
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'fs/*',
                'path',
                'child_process',
                'http',
                'https',
                'next',
                'next/*',
                'react',
                'react-dom',
                '@prisma/*',
                '@/generated/*',
                '@/server/*',
                '@/data/load',
                '@/app/*',
              ],
              message: 'src/domain is pure: pass data in as arguments instead of importing I/O.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'src/domain does no I/O.' },
        { name: 'process', message: 'src/domain does not read the environment.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass today in as an ISO date string.' },
        { object: 'Math', property: 'random', message: 'Domain functions are deterministic.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'new Date() reads the clock. Pass today in as an ISO date string.',
        },
      ],
    },
  },
]);
