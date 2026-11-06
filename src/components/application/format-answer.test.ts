import { describe, expect, it } from 'vitest';
import { formatAnswer } from './format-answer';

describe('formatAnswer', () => {
  it('shows a dash for no answer', () => {
    expect(formatAnswer('q_pep', undefined, 'en')).toBe('—');
    expect(formatAnswer('q_pep', '', 'en')).toBe('—');
    expect(formatAnswer('q_beneficial_owners', [''], 'en')).toBe('—');
  });

  it('labels an option in the language of the page', () => {
    expect(formatAnswer('q_pep', 'no', 'fi')).toBe('Ei');
  });

  it('keeps free text as it was typed', () => {
    expect(formatAnswer('q_company_name', 'Haapalan Tila Oy', 'en')).toBe('Haapalan Tila Oy');
  });

  it('joins a list', () => {
    expect(formatAnswer('q_beneficial_owners', ['Jussi', 'Maria'], 'en')).toBe('Jussi, Maria');
  });

  it('shows money in euros', () => {
    expect(formatAnswer('q_monthly_income', 320_000, 'en')).toBe('€3,200.00');
  });
});
