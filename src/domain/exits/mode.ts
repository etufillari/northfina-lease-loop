// How a customer leaves a contract: keep the item (buy), give it back (return), or name who
// takes it next (pass on, D16). The schema the domain and the routes share.
import { z } from 'zod';

export const exitModes = ['buy', 'return', 'pass_on'] as const;
export const exitModeSchema = z.enum(exitModes);
export type ExitMode = z.infer<typeof exitModeSchema>;
