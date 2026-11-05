// Shared by server pages and the client picker. Lives in its own file because importing a
// constant from a 'use client' module gives server components a client reference, not the
// string.
export const PERSONA_COOKIE = 'persona';
