// Small time-duration helpers, so a duration reads as itself (`hours(12)`) instead of a
// chain of multiplications (`12 * 60 * 60`) that has to be re-parsed every time it's read.
// Pure and framework-agnostic: safe to import from src/domain, src/server or the UI.
//
// All three return seconds, the unit most of this app's APIs expect (JWT "exp", cookie
// maxAge). Convert to milliseconds explicitly at the call site (`* 1000`) when doing
// Date arithmetic instead of adding a second, millisecond-denominated set of these: that
// multiplication is a unit conversion, not a duration, so it should stay visible.

/** `n` seconds, as seconds. The identity function: lets a literal count of seconds read
 *  as a duration (`seconds(30)`) instead of a bare, unlabelled number. */
export function seconds(n: number): number {
  return n;
}

/** `n` minutes, in seconds. */
export function minutes(n: number): number {
  return seconds(n) * 60;
}

/** `n` hours, in seconds. */
export function hours(n: number): number {
  return minutes(n) * 60;
}
