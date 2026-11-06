import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, it } from 'vitest';
import { noServerInClient } from './eslint-no-server-in-client.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
});

const filename = '/repo/src/components/quote-panel.tsx';
const client = (code) => `'use client';\n${code}`;
const invalid = (code, name = filename) => ({
  code: client(code),
  filename: name,
  errors: [{ messageId: 'serverImport' }],
});

tester.run('no-server-in-client', noServerInClient, {
  valid: [
    { code: client(`import { quote } from '@/domain/pricing/pricing';`), filename },
    { code: client(`import { t } from '@/i18n/get-t';`), filename },
    { code: client(`import { useState } from 'react';`), filename },
    { code: client(`import { x } from '@/data/schemas';`), filename },
    { code: client(`import type { ApiEnvelope } from '@/server/api-response';`), filename },
    { code: client(`import { type ApiEnvelope } from '@/server/api-response';`), filename },
    { code: `import { db } from '@/server/db';`, filename: '/repo/src/app/page.tsx' },
    { code: `import { loadAssets } from '@/data/load';`, filename: '/repo/src/app/page.tsx' },
  ],
  invalid: [
    invalid(`import { db } from '@/server/db';`),
    invalid(`import { requireActor } from '@/server/auth/actor';`),
    invalid(`import { loadAssets } from '@/data/load';`),
    invalid(`import { db, type Db } from '@/server/db';`),
    invalid(`import '@/server/db';`),
    invalid(`const load = () => import('@/server/db');`),
    invalid(`import { db } from '../server/db';`),
    invalid(`import { loadAssets } from '../../data/load';`, '/repo/src/components/x/panel.tsx'),
    invalid(`import { db } from '@/server/db';`, '/repo/src/app/[locale]/assets/[id]/page.tsx'),
  ],
});
