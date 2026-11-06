// The values of an exit refusal, written for the visitor (review of PR #63): the domain sends
// a usage refusal with the raw unit code (`km`, `engine_hours`) and plain numbers; here each
// number becomes the localized usage text from `usage.<unit>` ("4 200 engine hours",
// "4 200 käyttötuntia"), so no raw code or unformatted number reaches the page.
import { usageUnitSchema } from '@/data/schemas';
import { formatNumber } from '@/i18n/format';
import type { MessageKey, Translate, TranslateValues } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

/** The usage fields a refusal may carry next to its `unit`. */
const USAGE_FIELDS = ['value', 'atSigning'] as const;

export function exitRefusalValues(
  params: Record<string, unknown> | undefined,
  t: Translate,
  locale: Locale
): TranslateValues {
  const values: TranslateValues = {};
  for (const [name, value] of Object.entries(params ?? {})) {
    if (typeof value === 'string' || typeof value === 'number') values[name] = value;
  }
  const unit = usageUnitSchema.safeParse(params?.unit);
  if (!unit.success) return values;
  for (const field of USAGE_FIELDS) {
    const n = params?.[field];
    if (typeof n !== 'number') continue;
    values[field] = t(`usage.${unit.data}` as MessageKey, { value: formatNumber(n, locale) });
  }
  return values;
}
