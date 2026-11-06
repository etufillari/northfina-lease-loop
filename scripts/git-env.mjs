// Git exports GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and similar variables to hooks
// (for example pre-push running `npm test`) and to `git rebase --exec`. They take
// precedence over `git -C <dir>`, so a test that builds a throwaway repository would
// instead re-initialise, configure and commit to the repository running the hook.
// Run fixture repositories with `withoutGitEnv()`; the test setup also strips them.

/** True for variables Git reads to locate or configure a repository (`GIT_*`). */
export function isGitEnvKey(key) {
  return key.startsWith('GIT_');
}

/** A copy of `env` without any `GIT_*` variable, for commands on fixture repositories. */
export function withoutGitEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !isGitEnvKey(key)));
}
