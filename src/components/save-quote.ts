// Saves what the customer picked on the sliders. The server recalculates the price, so the
// browser sends the choice, never the amounts.
import { z } from 'zod';

const responseSchema = z.union([
  z.object({ success: z.literal(true), data: z.object({ id: z.string() }) }),
  z.object({ success: z.literal(false), error: z.object({ code: z.string() }) }),
]);

export type QuoteToSave = {
  assetId: string;
  termMonths: number;
  downPaymentCents: number;
  quotedOn: string;
};

export type SaveQuoteResult =
  { ok: true; quoteId: string } | { ok: false; reason: 'asset_unavailable' | 'failed' };

export async function saveQuote(quote: QuoteToSave): Promise<SaveQuoteResult> {
  try {
    const response = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // There is no login in this app, so every customer is recorded as the same actor.
      body: JSON.stringify({ ...quote, actor: 'customer' }),
    });
    const body = responseSchema.parse(await response.json());
    if (body.success) return { ok: true, quoteId: body.data.id };
    return {
      ok: false,
      reason: body.error.code === 'ASSET_UNAVAILABLE' ? 'asset_unavailable' : 'failed',
    };
  } catch {
    // Offline, or an answer we can't read: the customer can simply try again.
    return { ok: false, reason: 'failed' };
  }
}
