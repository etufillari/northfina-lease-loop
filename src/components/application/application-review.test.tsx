import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messages } from '@/i18n/get-t';
import ApplicationReview from './application-review';

const noop = () => {};

function renderInFinnish() {
  render(
    <ApplicationReview
      locale="fi"
      termMonths={36}
      downPaymentCents={0}
      questions={[
        { id: 'q_can_sign', type: 'choice', text: 'Voitko?', why_we_ask: '', options: ['yes'] },
      ]}
      answers={{ q_can_sign: 'yes' }}
      blocked={{ reason: 'min_age', eligible_from: '2027-03-10' }}
      onBack={noop}
      onSubmit={noop}
      submitting={false}
    />
  );
}

describe('ApplicationReview', () => {
  it('speaks the language of the page', () => {
    renderInFinnish();

    expect(screen.getByText(messages.fi['application.review.title'])).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Takaisin kysymyksiin' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lähetä hakemus' })).toBeTruthy();
    expect(screen.queryByText('Back to questions')).toBeNull();
  });

  it('shows why the applicant is blocked and a translated answer', () => {
    renderInFinnish();

    expect(screen.getByText(messages.fi['application.reason.min_age'])).toBeTruthy();
    expect(screen.getByText('Kyllä')).toBeTruthy();
  });
});
