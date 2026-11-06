import { describe, expect, it } from 'vitest';
import { isSentinel, previousAnswered } from './wizard-back';

const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }];
const form = (answered: string[], next: string | null) => ({
  visibleQuestions: questions,
  nextQuestionId: next,
  application: { answers: Object.fromEntries(answered.map((id) => [id, 'x'])) },
});
const back = (state: ReturnType<typeof form>, editing: string | null) =>
  previousAnswered(state, editing)?.id ?? null;

describe('previousAnswered: where Back goes', () => {
  it('goes to the last answered question before the one on screen', () => {
    expect(back(form(['q1', 'q2'], 'q3'), null)).toBe('q2');
  });

  it('keeps walking backwards while re-editing, then runs out at the first question', () => {
    const state = form(['q1', 'q2'], 'q3');
    expect(back(state, 'q2')).toBe('q1');
    expect(back(state, 'q1')).toBeNull();
  });

  it('never goes forward: re-editing an early question does not jump to a later one', () => {
    expect(back(form(['q1', 'q2', 'q3'], 'q4'), 'q1')).toBeNull();
  });

  it('skips questions that are not answered', () => {
    expect(back(form(['q1', 'q3'], 'q4'), null)).toBe('q3');
    expect(back(form(['q1', 'q3'], 'q4'), 'q3')).toBe('q1');
  });

  it('on the final review goes to the last answered question', () => {
    expect(back(form(['q1', 'q2', 'q3', 'q4'], null), null)).toBe('q4');
  });

  it('has nowhere to go on the first question', () => {
    expect(back(form([], 'q1'), null)).toBeNull();
  });
});

describe('isSentinel', () => {
  it('recognises only the form’s own history entry', () => {
    expect(isSentinel({ leaseWizard: true, __NA: true })).toBe(true);
    expect(isSentinel({ __NA: true })).toBe(false);
    expect(isSentinel(null)).toBe(false);
    expect(isSentinel('leaseWizard')).toBe(false);
  });
});
