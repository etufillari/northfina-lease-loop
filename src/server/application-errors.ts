import { ApiError } from './api-response';
import type { ApplicationSubmissionFailure } from './applications';
import { throwQuoteError } from './quote-errors';

/** Maps application-specific submission failures to stable API errors. */
export function throwApplicationError(result: ApplicationSubmissionFailure): never {
  switch (result.reason) {
    case 'customer_not_found':
      throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'The requested customer was not found');
    case 'customer_type_mismatch':
      throw new ApiError(
        422,
        'CUSTOMER_TYPE_MISMATCH',
        'The application customer type is invalid',
        {
          customerType: result.customerType,
          answerType: result.answerType,
        }
      );
    case 'incomplete':
      throw new ApiError(
        422,
        'APPLICATION_INCOMPLETE',
        'The application is missing required answers',
        {
          missingQuestionIds: result.missingQuestionIds,
        }
      );
    default:
      return throwQuoteError(result);
  }
}
