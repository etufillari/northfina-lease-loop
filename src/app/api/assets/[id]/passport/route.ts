// GET /api/assets/:id/passport
// The asset, its lives (the past lives the data pack counts, then the event log) as of the
// demo clock's day, and the CO2 and money its later lives saved (decisions D15, D80).
import { fail, handleRoute, ok } from '@/server/api-response';
import { readPassport } from '@/server/asset-events';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { assetIdParamsSchema, passportResponseSchema } from '@/server/routes';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/assets/[id]/passport'>) => {
    const { id } = assetIdParamsSchema.parse(await params);
    const asOf = await todayForRequest();
    const result = await readPassport(db, id, asOf);
    if (!result) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);

    return ok(
      passportResponseSchema.parse({
        asset: result.asset,
        asOf,
        before: result.passport.before,
        lives: result.passport.lives,
        co2: { perLifeKg: result.co2.perLifeKg, totalKg: result.co2.totalKg },
        money: result.money,
      })
    );
  }
);
