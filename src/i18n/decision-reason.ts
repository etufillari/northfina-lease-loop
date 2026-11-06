import type { Translate } from './get-t';
export function explainDecision(reason: string | undefined, t: Translate) {
  switch (reason) {
    case 'Applicant must be at least 18 years old':
      return t('lease.underage');
    case 'Politically exposed person requires manual review':
      return t('decision.pep');
    case 'Applicant signing authority must be confirmed':
      return t('decision.signer');
    case 'Monthly rent including VAT exceeds the affordability limit':
      return t('decision.affordability');
    case 'Customer business ID is invalid':
      return t('decision.businessId');
    case 'Country is outside the supported leasing area':
      return t('decision.country');
    case 'Asset is unavailable':
      return t('decision.unavailable');
    default:
      return t('decision.review');
  }
}
