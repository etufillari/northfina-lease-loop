// POST /api/applications/questions?locale=fi
// body: { asset_id, quantity?, term_months, down_payment_cents?, answers? }
// Which questions apply to this customer and deal, given the answers so far. Send it again
// after every answer: the list can grow or shrink. Saves nothing. Texts come back in `locale`
// (default en), and `why_we_ask` falls back to English where it has no translation.
import { z } from 'zod';
import { defaultLocale, locales } from '@/i18n/locales';
import { requireCustomer } from '@/server/actor';
import { applicationRequestSchema, failureResponse } from '@/server/application-request';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { describeQuestions } from '@/server/applications';
import { db } from '@/server/db';

const querySchema = z.strictObject({ locale: z.enum(locales).default(defaultLocale) });

export const POST = handleRoute(async (request) => {
  const customer = await requireCustomer('application.submit');
  const searchParams = new URL(request.url).searchParams;
  const { locale } = querySchema.parse(Object.fromEntries(searchParams));
  const body = await readJsonBody(request, applicationRequestSchema);

  const result = await describeQuestions(db, {
    customer,
    assetId: body.asset_id,
    quantity: body.quantity,
    termMonths: body.term_months,
    downPaymentCents: body.down_payment_cents,
    answers: body.answers,
  });
  if (!result.ok) return failureResponse(result, body.asset_id);

  const { questions, ...rest } = result;
  return ok({
    ...rest,
    questions: questions.map(({ id, type, text, why_we_ask, options, validation }) => ({
      id,
      type,
      text: text[locale],
      why_we_ask: why_we_ask[locale] ?? why_we_ask.en,
      ...(options ? { options } : {}),
      ...(validation ? { hint: validation.hint } : {}),
    })),
  });
});
