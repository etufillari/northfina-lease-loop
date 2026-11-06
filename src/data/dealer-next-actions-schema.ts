import { z } from 'zod';

// No application IDs, customer profiles, answers or signatory addresses cross this boundary.
export const dealerNextActionsSchema = z.array(
  z.object({
    assetId: z.string(),
    make: z.string(),
    model: z.string(),
    kind: z.enum(['awaiting_signer', 'prepare_item', 'offer_ready']),
    pendingSignatures: z.number().int().nonnegative(),
  })
);
