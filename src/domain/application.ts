import { roundRatio } from './circular/money';
import type { Asset, Customer } from '@/data/schemas';

export type ApplicationStatus = 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';

export type ApplicationDecision = Readonly<{
  status: ApplicationStatus;
  reason: string;
  signingAuthority: boolean;
}>;

export type ApplicationDecisionInput = Readonly<{
  customer: Customer;
  asset: Asset;
  monthlyNetCents: number;
  asOf: string;
  vatRateBps?: number;
}>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AFFORDABILITY_PERCENT = 30;

function isValidFinnishBusinessId(value: string): boolean {
  const match = /^(\d{7})-(\d)$/.exec(value);
  if (!match) return false;
  const digits = (match[1] ?? '').split('').map(Number);
  const checkDigit = Number(match[2] ?? '');
  const weights = [7, 9, 10, 5, 8, 4, 2];
  const weightedSum = digits.reduce((sum, digit, index) => sum + digit * (weights[index] ?? 0), 0);
  const remainder = weightedSum % 11;
  const expected = remainder === 0 ? 0 : remainder === 1 ? -1 : 11 - remainder;
  return expected === checkDigit;
}

function isAdult(birthDate: string, asOf: string): boolean {
  const birthYear = Number(birthDate.slice(0, 4));
  const birthMonth = Number(birthDate.slice(5, 7));
  const birthDay = Number(birthDate.slice(8, 10));
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  const day = Number(asOf.slice(8, 10));
  const birthdayPassed = month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (birthdayPassed ? 0 : 1) >= 18;
}

export function decideApplication(input: ApplicationDecisionInput): ApplicationDecision {
  if (!ISO_DATE.test(input.asOf)) {
    throw new RangeError(`asOf must look like YYYY-MM-DD, got "${input.asOf}"`);
  }
  if (!Number.isSafeInteger(input.monthlyNetCents) || input.monthlyNetCents <= 0) {
    return {
      status: 'REJECTED',
      reason: 'Monthly net rent must be a positive whole number of cents',
      signingAuthority: false,
    };
  }
  if (input.asset.status !== 'available') {
    return {
      status: 'REJECTED',
      reason: 'Asset is unavailable',
      signingAuthority: false,
    };
  }
  if (input.customer.type !== 'company' && !isAdult(input.customer.birth_date, input.asOf)) {
    return {
      status: 'REJECTED',
      reason: 'Applicant must be at least 18 years old',
      signingAuthority: false,
    };
  }
  if (!['FI', 'SE', 'EE'].includes(input.customer.country))
    return {
      status: 'REJECTED',
      reason: 'Country is outside the supported leasing area',
      signingAuthority: false,
    };
  if (input.customer.type !== 'consumer' && !isValidFinnishBusinessId(input.customer.business_id)) {
    return {
      status: 'REJECTED',
      reason: 'Customer business ID is invalid',
      signingAuthority: false,
    };
  }
  if (input.customer.is_pep) {
    return {
      status: 'MANUAL_REVIEW',
      reason: 'Politically exposed person requires manual review',
      signingAuthority:
        input.customer.type === 'company' ? input.customer.applicant_can_sign : true,
    };
  }
  const rate = input.vatRateBps ?? 2550; // Compatibility default for the 2026 rule; services pass the dated rate.
  if (!Number.isInteger(rate) || rate < 0 || rate > 10000) throw new RangeError('Invalid VAT rate');
  const grossCents =
    input.monthlyNetCents + roundRatio(BigInt(input.monthlyNetCents) * BigInt(rate), 10000n);
  if (
    input.customer.type === 'consumer' &&
    grossCents * 100 > input.customer.monthly_net_income_cents * AFFORDABILITY_PERCENT
  ) {
    return {
      status: 'REJECTED',
      reason: 'Monthly rent including VAT exceeds the affordability limit',
      signingAuthority: false,
    };
  }
  const signingAuthority = input.customer.type !== 'company' || input.customer.applicant_can_sign;
  return signingAuthority
    ? { status: 'APPROVED', reason: 'Eligibility checks passed', signingAuthority }
    : {
        status: 'MANUAL_REVIEW',
        reason: 'Applicant signing authority must be confirmed',
        signingAuthority,
      };
}
