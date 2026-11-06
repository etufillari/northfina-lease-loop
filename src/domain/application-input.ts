import { z } from 'zod';

export const leaseTermSchema = z.union([
  z.literal(12),
  z.literal(24),
  z.literal(36),
  z.literal(48),
]);
