/** Joins class names, skipping the falsy ones: `cx('a', on && 'b')`. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
