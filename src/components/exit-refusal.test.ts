// The usage refusal reads in the visitor's language with its unit and formatted numbers.
import { describe, expect, it } from 'vitest';
import { getT } from '@/i18n/get-t';
import { exitRefusalValues } from './exit-refusal';

const params = { value: 4200, atSigning: 5100, unit: 'engine_hours' };

describe('exitRefusalValues', () => {
  it('writes each usage number with its unit in the language (a farm machine, fi)', () => {
    const values = exitRefusalValues(params, getT('fi'), 'fi');
    expect(values.value).toMatch(/^4\s200 käyttötuntia$/);
    expect(values.atSigning).toMatch(/^5\s100 käyttötuntia$/);
  });

  it('the whole sentence carries no raw unit code in any language', () => {
    for (const locale of ['en', 'fi', 'sv', 'et'] as const) {
      const t = getT(locale);
      const text = t('exit.refusal.usage_below_signing', exitRefusalValues(params, t, locale));
      expect(text).not.toContain('engine_hours');
      expect(text).not.toContain('{');
    }
  });

  it('keeps other params as they are and ignores a unit outside the list', () => {
    expect(
      exitRefusalValues({ status: 'ended', unit: 'parsecs', value: 3 }, getT('en'), 'en')
    ).toEqual({
      status: 'ended',
      unit: 'parsecs',
      value: 3,
    });
    expect(exitRefusalValues(undefined, getT('en'), 'en')).toEqual({});
  });
});
