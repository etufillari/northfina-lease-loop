import { describe, expect, it } from 'vitest';
import { demoToolsOn } from './demo-tools';

describe('demoToolsOn (D74, wave 3 finding 6)', () => {
  it.each([
    [{ DEMO_TOOLS: '1', NODE_ENV: 'production' }, true],
    [{ DEMO_TOOLS: '0', NODE_ENV: 'development' }, false],
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'test' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ DEMO_TOOLS: 'yes', NODE_ENV: 'production' }, false],
  ])('%o → %s', (env, expected) => {
    expect(demoToolsOn(env)).toBe(expected);
  });
});
