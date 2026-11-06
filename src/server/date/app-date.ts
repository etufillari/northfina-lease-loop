// The date the app runs on: the real date, unless an admin has set a demo date. It lives on
// the server so a client can never choose the date that prices its own deal. Every page,
// route and service that needs "today" should call `currentDate`.
import { isoDateSchema } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from '../audit';
import { todayIso } from './today';

const DEMO_DATE_KEY = 'demo_date';

export type AppDate = { date: string; is_demo: boolean };

export async function getAppDate(db: PrismaClient): Promise<AppDate> {
  const row = await db.appSetting.findUnique({ where: { key: DEMO_DATE_KEY } });
  if (!row) return { date: todayIso(), is_demo: false };
  return { date: isoDateSchema.parse(row.value), is_demo: true };
}

export async function currentDate(db: PrismaClient): Promise<string> {
  return (await getAppDate(db)).date;
}

/** Sets the demo date, or goes back to the real date when `date` is null. */
export async function setDemoDate(
  db: PrismaClient,
  input: { date: string | null; actor: string }
): Promise<AppDate> {
  const { date, actor } = input;
  const existing = await db.appSetting.findUnique({ where: { key: DEMO_DATE_KEY } });

  await withAudit(
    db,
    {
      actor,
      action: 'demo_date.changed',
      entityType: 'app_setting',
      entityId: DEMO_DATE_KEY,
      details: { from: existing?.value ?? null, to: date },
    },
    async (tx) => {
      if (date === null) {
        await tx.appSetting.deleteMany({ where: { key: DEMO_DATE_KEY } });
      } else {
        await tx.appSetting.upsert({
          where: { key: DEMO_DATE_KEY },
          create: { key: DEMO_DATE_KEY, value: date },
          update: { value: date },
        });
      }
    }
  );

  return getAppDate(db);
}
