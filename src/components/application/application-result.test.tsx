import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { eligibilityReasonSchema } from '@/data/lease-schemas';
import { messages } from '@/i18n/get-t';
import { locales } from '@/i18n/locales';
import ApplicationResult from './application-result';

describe('ApplicationResult', () => {
  const cases = locales.flatMap((locale) =>
    eligibilityReasonSchema.options.map((reason) => [locale, reason] as const)
  );

  it.each(cases)('in %s explains %s in words, not as a code', (locale, reason) => {
    render(
      <ApplicationResult
        locale={locale}
        application={{ id: 'app-1', decision: 'rejected', reasons: [reason], eligible_from: null }}
      />
    );

    expect(screen.getByText(messages[locale][`application.reason.${reason}`])).toBeTruthy();
    expect(screen.queryByText(reason)).toBeNull();
  });
});
