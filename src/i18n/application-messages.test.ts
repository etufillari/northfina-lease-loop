import { describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import { messages } from './get-t';
import { locales } from './locales';

describe('application question translations', () => {
  it('provides every question explanation and option in all four languages', async () => {
    const bank = await loadQuestions();
    for (const locale of locales) {
      const dictionary = messages[locale] as Record<string, string>;
      for (const question of bank.questions) {
        expect(
          dictionary[`application.why.${question.id}`],
          `${locale}: ${question.id}`
        ).toBeTruthy();
        for (const option of question.options ?? [])
          expect(dictionary[`application.option.${option}`], `${locale}: ${option}`).toBeTruthy();
      }
    }
  });
});
