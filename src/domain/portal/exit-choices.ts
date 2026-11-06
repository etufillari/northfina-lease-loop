// The ways out of a contract that apply on a day, for the portal's contract rows (D75). Only the
// labels and the end day, no amounts: the contract page's exit section prices them. The gate is
// the one `planExit` (src/domain/exits/exit-plan.ts) applies before it plans: an ended contract
// and one not started yet have no choice; on or after the last day it is the end of the term,
// before it an early exit (D14, D16). Every mode is open either way.
import { exitModes, type ExitMode } from '../exits';
import { parseIsoDate } from '../invoicing';
import { contractStatusSchema, type ContractStatus } from '../statuses';

export type ContractForChoices = { status: string; startDate: string; endDate: string };

export type ExitChoices =
  | { code: 'end_of_term' | 'early_exit'; params: { modes: ExitMode[]; endDate: string } }
  | { code: 'not_started'; params: { startDate: string } }
  | { code: 'contract_ended'; params: { status: ContractStatus } };

/** Throws on a status that is not a contract status or a `today` that is not a calendar day. */
export function endOfTermChoices(contract: ContractForChoices, today: string): ExitChoices {
  parseIsoDate(today);
  const status = contractStatusSchema.parse(contract.status);
  if (status !== 'active') return { code: 'contract_ended', params: { status } };
  if (today < contract.startDate) {
    return { code: 'not_started', params: { startDate: contract.startDate } };
  }
  return {
    code: today >= contract.endDate ? 'end_of_term' : 'early_exit',
    params: { modes: [...exitModes], endDate: contract.endDate },
  };
}
