import { describe, expect, it } from 'vitest';
import { checkAnswer, MAX_TEXT_LENGTH } from './answer-check';

const choice = { type: 'choice' as const, options: ['FI', 'SE', 'EE', 'other'] };
const of = (type: string) => ({ type: type as never, options: undefined });

describe('checkAnswer', () => {
  it('a choice must be one of the options offered', () => {
    expect(checkAnswer(choice, 'FI')).toEqual({ ok: true });
    expect(checkAnswer(choice, 'other')).toEqual({ ok: true });
    expect(checkAnswer(choice, 'DE')).toEqual({ ok: false, reason: 'not_an_option' });
    expect(checkAnswer(choice, 1)).toEqual({ ok: false, reason: 'not_an_option' });
  });

  it('text is non-empty and not endless', () => {
    expect(checkAnswer(of('text'), 'Aino Virtanen')).toEqual({ ok: true });
    expect(checkAnswer(of('text'), '   ')).toEqual({ ok: false, reason: 'empty_text' });
    expect(checkAnswer(of('text'), 'x'.repeat(MAX_TEXT_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'text_too_long',
    });
  });

  it('an e-mail looks like one', () => {
    expect(checkAnswer(of('email'), 'ceo@norvi.example.com')).toEqual({ ok: true });
    expect(checkAnswer(of('email'), 'ceo at norvi')).toEqual({ ok: false, reason: 'bad_email' });
  });

  it('money is whole, non-negative cents', () => {
    expect(checkAnswer(of('money'), 320_000)).toEqual({ ok: true });
    expect(checkAnswer(of('money'), 0)).toEqual({ ok: true });
    for (const bad of [3200.5, -1, '320000', Number.NaN]) {
      expect(checkAnswer(of('money'), bad)).toEqual({ ok: false, reason: 'bad_money' });
    }
  });

  it('a date is a real calendar date', () => {
    expect(checkAnswer(of('date'), '2008-02-29')).toEqual({ ok: true });
    expect(checkAnswer(of('date'), '2009-02-29')).toEqual({ ok: false, reason: 'bad_date' });
    expect(checkAnswer(of('date'), '10.3.2009')).toEqual({ ok: false, reason: 'bad_date' });
  });

  it('a list has at least one non-empty entry', () => {
    expect(checkAnswer(of('list'), ['Jussi Haapala (60 %)'])).toEqual({ ok: true });
    expect(checkAnswer(of('list'), [])).toEqual({ ok: false, reason: 'bad_list' });
    expect(checkAnswer(of('list'), [''])).toEqual({ ok: false, reason: 'bad_list' });
    expect(checkAnswer(of('list'), 'Jussi')).toEqual({ ok: false, reason: 'bad_list' });
  });
});
