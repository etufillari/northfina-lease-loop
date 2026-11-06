import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getT } from '@/i18n/get-t';
import { locales } from '@/i18n/locales';
import type { ApplicationView } from '@/server/spine-views';
import { ApplicationStatus } from './application-status';

const questions = [
  {
    id: 'q_monthly_income',
    text: { en: 'Monthly income', fi: 'Kuukausitulot', sv: 'Månadsinkomst', et: 'Kuusissetulek' },
  },
  {
    id: 'q_signatory_email',
    text: {
      en: 'Signatory email',
      fi: 'Allekirjoittajan sähköposti',
      sv: 'Firmatecknarens e-post',
      et: 'Allkirjastaja e-post',
    },
  },
];
const incomplete: ApplicationView = {
  id: 'application',
  quoteId: 'quote',
  decision: 'incomplete',
  reasons: ['answers_missing', 'answers_invalid'],
  missingQuestionIds: ['q_signatory_email', 'q_monthly_income', 'q_monthly_income'],
  invalidQuestionIds: ['q_monthly_income'],
  answers: {},
};

describe('saved application guidance', () => {
  it.each(locales)(
    'links to each problem question once in %s without repeating generic reasons',
    (locale) => {
      const t = getT(locale);
      const markup = renderToStaticMarkup(
        createElement(ApplicationStatus, { application: incomplete, questions, locale })
      );
      for (const question of questions) {
        expect(markup).toContain(question.text[locale]);
        expect(markup.match(new RegExp('href="#' + question.id + '"', 'g'))).toHaveLength(1);
      }
      expect(markup).toContain(t('spine.fixHeading'));
      expect(markup).not.toContain(t('spine.reason.answers_missing'));
      expect(markup).not.toContain(t('spine.reason.answers_invalid'));
    }
  );

  it('keeps a generic reason when a saved problem has no visible question', () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationStatus, {
        application: {
          ...incomplete,
          missingQuestionIds: ['q_signatory_email', 'q_retired'],
        },
        questions,
        locale: 'en',
      })
    );
    expect(markup).toContain(getT('en')('spine.reason.answers_missing'));
    expect(markup).toContain('href="#q_signatory_email"');
    expect(markup).not.toContain('q_retired');
  });

  it('keeps the decline reason and explains that no agreement was created', () => {
    const t = getT('en');
    const markup = renderToStaticMarkup(
      createElement(ApplicationStatus, {
        application: {
          ...incomplete,
          decision: 'declined',
          reasons: ['under_age', 'answers_missing'],
          missingQuestionIds: ['q_signatory_email'],
          invalidQuestionIds: [],
        },
        questions,
        locale: 'en',
      })
    );
    expect(markup).toContain(t('spine.reason.under_age'));
    expect(markup).toContain(t('spine.nextDeclined'));
    expect(markup).not.toContain(t('spine.nextApproved'));
    expect(markup).not.toContain(t('spine.reason.answers_missing'));
  });
});
