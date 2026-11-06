// Builds the translated error messages the client action components show. Done on the server
// so the client bundle does not carry the translation files.
import type { Translate } from '@/i18n/get-t';
import type { ActionTexts } from './use-return-action';

export function buildActionTexts(t: Translate): ActionTexts {
  return {
    working: t('dealer.working'),
    genericError: t('dealer.error.generic'),
    errors: {
      NETWORK: t('dealer.error.network'),
      VALIDATION_ERROR: t('dealer.error.VALIDATION_ERROR'),
      RETURN_REQUEST_NOT_FOUND: t('dealer.error.RETURN_REQUEST_NOT_FOUND'),
      RETURN_REQUEST_NOT_REQUESTED: t('dealer.error.RETURN_REQUEST_NOT_REQUESTED'),
      RETURN_NOT_RECEIVED: t('dealer.error.RETURN_NOT_RECEIVED'),
      MISSING_SERVICE_HISTORY: t('dealer.error.MISSING_SERVICE_HISTORY'),
      RETURN_NOT_INSPECTED: t('dealer.error.RETURN_NOT_INSPECTED'),
      INSPECTION_INCOMPLETE: t('dealer.error.INSPECTION_INCOMPLETE'),
      INVALID_TARGET_CONDITION: t('dealer.error.INVALID_TARGET_CONDITION'),
      MISSING_REFURBISHMENT_COST_RULE: t('dealer.error.MISSING_REFURBISHMENT_COST_RULE'),
    },
  };
}
