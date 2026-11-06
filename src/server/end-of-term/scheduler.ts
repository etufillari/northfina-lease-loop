// Runs a task once a minute for as long as the server lives. It needs a long-running server,
// which is how this app runs. `next dev` can load this file again on a change, so the running
// timer is kept on globalThis, and starting it a second time does nothing.
const INTERVAL_MS = 60_000;

const running = globalThis as typeof globalThis & {
  contractScheduler?: ReturnType<typeof setInterval>;
};

/** Starts the timer, and returns a function that stops it. */
export function startContractScheduler(task: () => Promise<unknown>): () => void {
  const stop = () => {
    clearInterval(running.contractScheduler);
    running.contractScheduler = undefined;
  };
  if (running.contractScheduler !== undefined) return stop;

  const timer = setInterval(() => {
    task().catch((error: unknown) => {
      console.error('Contract scheduler failed:', error);
    });
  }, INTERVAL_MS);
  timer.unref();
  running.contractScheduler = timer;
  return stop;
}
