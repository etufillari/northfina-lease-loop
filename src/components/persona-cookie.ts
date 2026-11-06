// Shared by server pages and the client picker. Lives in its own file because importing a
// constant from a 'use client' module gives server components a client reference, not the
// string.
export const PERSONA_COOKIE = 'persona';

/** The staff persona: an actor for desk work, never a customer. */
export const STAFF_PERSONA = 'staff';

/** The persona as a customer id: null for nobody AND for staff. */
export function customerPersona(value: string | null | undefined): string | null {
  return value && value !== STAFF_PERSONA ? value : null;
}
