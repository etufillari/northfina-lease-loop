// Shared by server code and the nav-bar time-travel control. In its own file because
// importing a constant from a 'use client' module gives server components a client
// reference, not the string.
export const AS_OF_COOKIE = 'asOf';
