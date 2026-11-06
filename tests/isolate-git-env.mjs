// Vitest setup file: runs in every test worker before its tests. Removes inherited
// GIT_* variables so no test, or process it spawns, can touch the repository whose
// hook started the test run. See scripts/git-env.mjs for why.
import { isGitEnvKey } from '../scripts/git-env.mjs';

for (const key of Object.keys(process.env)) {
  if (isGitEnvKey(key)) delete process.env[key];
}
