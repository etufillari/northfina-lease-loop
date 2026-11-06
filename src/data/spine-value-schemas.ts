// Shared wire values; no database, framework, server I/O or private customer data.
import { z } from 'zod';

export const storageCentsSchema = z.number().int().min(0).max(2_147_483_647);
export const priceTermsSchema = z.strictObject({
  listPriceCents: storageCentsSchema,
  downPaymentCents: storageCentsSchema,
  financedCents: storageCentsSchema,
  termMonths: z.number().int().positive(),
  coefficientTableId: z.string(),
  coefficientTableVersion: z.number().int().positive(),
  band: z.string(),
  factorMillionths: z.number().int().positive(),
  monthlyNetCents: storageCentsSchema,
  buyoutNetCents: storageCentsSchema,
  totalRentNetCents: storageCentsSchema,
});
