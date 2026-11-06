// What falls due as the date moves. The scheduler and the demo date both run exactly this, so
// a new step only has to be added here. Safe to run at any time: finished work is skipped.
import type { PrismaClient } from '@/generated/prisma/client';
import { closeExpiredContracts } from './end-of-term/contract-end';
import { refreshFutureVat } from './invoicing/future-vat';

export async function runDueWork(db: PrismaClient, today: string): Promise<void> {
  await closeExpiredContracts(db, today);
  await refreshFutureVat(db, today);
}
