import { describe, expect, it } from 'vitest';
import { locales } from '@/i18n/locales';
import { loadQuestions } from './load';

describe('data/questions.json', () => {
  it.each(locales)('explains every question in %s', async (locale) => {
    const { questions } = await loadQuestions();
    for (const question of questions) {
      expect(question.text[locale], `${question.id} text`).toBeTruthy();
      expect(question.why_we_ask[locale], `${question.id} why_we_ask`).toBeTruthy();
    }
  });

  it.each(locales)('has every format hint in %s', async (locale) => {
    const { questions } = await loadQuestions();
    const hints = questions.flatMap((question) => question.validation?.hint ?? []);

    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) expect(hint[locale]).toBeTruthy();
  });
});
