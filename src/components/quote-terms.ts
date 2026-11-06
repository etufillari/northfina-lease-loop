// How the price page shows the terms an item may be offered (D43): a slider over several, a
// line for one (a fact, not a choice), and no calculator at all for none. Pure, shared by the
// page (server) and the calculator (client), so both decide the same way.

export type TermControl = 'slider' | 'static' | 'none';

/** What the term control is for this many allowed terms. */
export function termControl(terms: readonly number[]): TermControl {
  if (terms.length === 0) return 'none';
  return terms.length === 1 ? 'static' : 'slider';
}
