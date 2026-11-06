// Next.js calls `register` once when a server starts. The imports are inside it because the
// database driver only runs on Node, and this file is also loaded for other runtimes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { db } = await import('./server/db');
  const { currentDate } = await import('./server/date/app-date');
  const { closeDueContracts } = await import('./server/end-of-term/contract-end');
  const { startContractScheduler } = await import('./server/end-of-term/scheduler');
  const { refreshFutureVat } = await import('./server/invoicing/future-vat');

  startContractScheduler(async () => {
    await closeDueContracts(db);
    await refreshFutureVat(db, await currentDate(db));
  });
}
