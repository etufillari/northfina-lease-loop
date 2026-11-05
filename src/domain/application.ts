export type ApplicationInput = {
  customerType: 'consumer' | 'sole_trader' | 'company';
  contractStartDate: string;
  birthDate?: string;
  country: string;
  financedAmountCents: number;
  monthlyRentWithVatCents?: number;
  monthlyNetIncomeCents?: number;
  businessId?: string;
  applicantCanSign?: boolean;
  isPep: boolean;
};

export type ApplicationReason =
  | 'under_minimum_age'
  | 'unsupported_residency'
  | 'unaffordable'
  | 'invalid_business_id'
  | 'unauthorised_signatory'
  | 'financed_amount_out_of_range'
  | 'pep_manual_review'
  | 'missing_required_information';

export type ApplicationDecision =
  | { decision: 'approved'; reasons: [] }
  | { decision: 'declined'; reasons: ApplicationReason[] }
  | { decision: 'manual_review'; reasons: ApplicationReason[] };

function ageOnDate(birthDate: string, date: string): number {
  const birthYear = Number(birthDate.slice(0, 4));
  const birthdayPassed = date.slice(5) >= birthDate.slice(5);
  return Number(date.slice(0, 4)) - birthYear - (birthdayPassed ? 0 : 1);
}

/**
 * Finnish Y-tunnus check digit validation.
 * The weighted remainder 1 is invalid; other non-zero remainders use 11 - remainder.
 */
export function isValidFinnishBusinessId(value: string): boolean {
  if (!/^\d{7}-\d$/.test(value)) return false;

  const digits = `${value.slice(0, 7)}${value.slice(8)}`.split('').map(Number);
  const checkDigit = digits.at(-1);
  if (checkDigit === undefined) return false;

  const weightedSum = digits
    .slice(0, 7)
    .reduce((sum, digit, index) => sum + digit * [7, 9, 10, 5, 8, 4, 2][index]!, 0);
  const remainder = weightedSum % 11;
  if (remainder === 1) return false;
  return (remainder === 0 ? 0 : 11 - remainder) === checkDigit;
}

export function evaluateApplication(input: ApplicationInput): ApplicationDecision {
  const declines: ApplicationReason[] = [];

  if (input.financedAmountCents < 30_000 || input.financedAmountCents > 25_000_000) {
    declines.push('financed_amount_out_of_range');
  }

  if (input.customerType !== 'company') {
    if (!input.birthDate) {
      declines.push('missing_required_information');
    } else if (ageOnDate(input.birthDate, input.contractStartDate) < 18) {
      declines.push('under_minimum_age');
    }
  }

  if (!['FI', 'SE', 'EE'].includes(input.country)) {
    declines.push('unsupported_residency');
  }

  if (input.customerType !== 'consumer') {
    if (!input.businessId || !isValidFinnishBusinessId(input.businessId)) {
      declines.push('invalid_business_id');
    }
  }

  if (input.customerType === 'company' && input.applicantCanSign === false) {
    declines.push('unauthorised_signatory');
  }

  if (
    input.customerType === 'consumer' &&
    (input.monthlyRentWithVatCents === undefined || input.monthlyNetIncomeCents === undefined)
  ) {
    declines.push('missing_required_information');
  } else if (
    input.customerType === 'consumer' &&
    input.monthlyRentWithVatCents! * 100 > input.monthlyNetIncomeCents! * 30
  ) {
    declines.push('unaffordable');
  }

  if (declines.length > 0) return { decision: 'declined', reasons: declines };
  if (input.isPep) return { decision: 'manual_review', reasons: ['pep_manual_review'] };
  return { decision: 'approved', reasons: [] };
}
