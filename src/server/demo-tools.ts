// Whether the demo tools answer (D74, wave 3 review finding 6): `POST /api/demo/cards/:id/run`
// runs a scenario card and sets the actor cookie, so it is a switch, not a public endpoint.
// `DEMO_TOOLS=1` turns them on, `DEMO_TOOLS=0` off; left out, they are on in development and in
// the tests and off in a production build.
export function demoToolsOn(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEMO_TOOLS === '1') return true;
  if (env.DEMO_TOOLS === '0') return false;
  return env.NODE_ENV !== 'production';
}
