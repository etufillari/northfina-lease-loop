import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import questionsFile from '../../../data/questions.json';
import { messages } from '@/i18n/get-t';
import { locales } from '@/i18n/locales';
import EligibilityQuestion, {
  getOptionLabel,
  type AnswerError,
  type ApplicationQuestion,
} from './eligibility-question';

describe('getOptionLabel', () => {
  it.each(locales)('has a label for every answer option in %s', (locale) => {
    for (const { id, options } of questionsFile.questions) {
      for (const option of options ?? []) {
        expect(getOptionLabel(id, option, locale), `${id}: ${option}`).not.toBe(option);
      }
    }
  });
});

describe('EligibilityQuestion: email errors', () => {
  const question: ApplicationQuestion = {
    id: 'q_email',
    type: 'email',
    text: 'Email address',
    why_we_ask: '',
  };
  const error: AnswerError = { question_id: 'q_email', reason: 'not_an_email' };
  const message = messages.en['application.question.error.not_an_email'];

  const renderEmail = () =>
    render(
      <EligibilityQuestion
        question={question}
        value="a@"
        onChange={() => {}}
        locale="en"
        error={error}
      />
    );

  const typeInField = () =>
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b' } });

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an error when nothing is being typed', () => {
    renderEmail();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('hides the error while typing', () => {
    renderEmail();
    typeInField();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'false');
  });

  it('shows it after a pause', () => {
    renderEmail();
    typeInField();

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('starts the pause again with every key', () => {
    renderEmail();

    typeInField();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@bc' } });
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows it straight away when leaving the field', () => {
    renderEmail();
    typeInField();

    fireEvent.blur(screen.getByLabelText('Email address'));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });
});

describe('EligibilityQuestion: dates', () => {
  it('asks for a date with three dropdowns, in the language of the page', () => {
    render(
      <EligibilityQuestion
        question={{ id: 'q_birth_date', type: 'date', text: 'Syntymäaika', why_we_ask: '' }}
        value={undefined}
        onChange={() => {}}
        locale="fi"
      />
    );

    expect(
      screen.getByRole('combobox', { name: messages.fi['application.question.day'] })
    ).toBeTruthy();
    expect(
      screen.getByRole('combobox', { name: messages.fi['application.question.year'] })
    ).toBeTruthy();
    expect(screen.getByLabelText('Syntymäaika')).toBeTruthy();
  });
});
