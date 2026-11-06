import { describe, expect, it } from 'vitest';
import questionsFile from '../../../data/questions.json';
import { locales } from '@/i18n/locales';
import { getOptionLabel } from './eligibility-question';

describe('getOptionLabel', () => {
  it.each(locales)('has a label for every answer option in %s', (locale) => {
    for (const { id, options } of questionsFile.questions) {
      for (const option of options ?? []) {
        expect(getOptionLabel(id, option, locale), `${id}: ${option}`).not.toBe(option);
      }
    }
  });
});
