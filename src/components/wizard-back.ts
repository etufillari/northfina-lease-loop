// How the application form's Back works (on-screen button and browser Back alike). Pure, so
// it is tested on its own; src/components/application-wizard.tsx wires it to the history.

/**
 * Where Back goes: the last answered question BEFORE the one on screen, in question order.
 * Strictly earlier, so repeated Backs walk steadily to the first question and then leave the
 * page, never bouncing forward again. On the final review (no question on screen) it is the
 * last answered question. Null when there is nothing earlier to go to.
 */
export function previousAnswered<Q extends { id: string }>(
  state: {
    visibleQuestions: readonly Q[];
    nextQuestionId: string | null;
    application: { answers: Record<string, unknown> };
  },
  editingId: string | null
): Q | null {
  const activeId = editingId ?? state.nextQuestionId;
  const activeIndex = state.visibleQuestions.findIndex((q) => q.id === activeId);
  const before =
    activeIndex === -1 ? state.visibleQuestions : state.visibleQuestions.slice(0, activeIndex);
  return before.filter((q) => state.application.answers[q.id] !== undefined).at(-1) ?? null;
}

/** The history entry the form pushes so the browser's Back steps back one question. */
export function isSentinel(historyState: unknown): boolean {
  return (
    typeof historyState === 'object' &&
    historyState !== null &&
    (historyState as { leaseWizard?: unknown }).leaseWizard === true
  );
}
