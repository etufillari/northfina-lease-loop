// The demo's stand-ins for things a real deployment has: a persona picker instead of a login,
// a time machine instead of the calendar, a reset button. All of them switch off together
// with DEMO_MODE=off — then "today" is the real date (no ?asOf= or cookie override, so
// nobody can backdate a quote, a hold or an age check), nobody is signed in until a real
// login fills in src/server/current-user.ts, and the demo routes answer 404.
//
// On unless set to "off", so the hackathon demo needs no configuration.
export function demoMode(): boolean {
  return process.env.DEMO_MODE !== 'off';
}
