// Writes the card runner's codes in the visitor's language (AGENTS.md rule 6): a step's code is
// `demo.step.<code>`, a refusal's `demo.run.<code>`; params named `…Cents` are money, `date` and
// `…Date` / `…On` are days, `decision`, `status` and `condition` are the app's own words.
// Shared by the server page (the inputs line) and the client run button (the steps).
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { messages, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type CodedLine = { code: string; params: Record<string, string | number> };

function formatParam(name: string, value: string | number, t: Translate, locale: Locale) {
  if (typeof value === 'number' && name.endsWith('Cents')) {
    return formatEuro(value, intlLocale[locale]);
  }
  if (typeof value !== 'string') return value;
  if (name === 'date' || name.endsWith('Date') || name.endsWith('On')) {
    return formatIsoDate(value, locale);
  }
  if (name === 'decision') return t(`decision.status.${value}` as MessageKey);
  if (name === 'status') return t(`status.${value}` as MessageKey);
  if (name === 'condition') return t(`condition.${value}` as MessageKey);
  return value;
}

/** The params of a coded line, formatted for `locale`. */
export function formatParams(
  params: CodedLine['params'],
  t: Translate,
  locale: Locale
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, formatParam(name, value, t, locale)])
  );
}

/** The message files' own refusal sentences, by the runner step that met the refusal. */
const REFUSAL_PREFIX: Record<string, string> = {
  quote: 'pricing.refusal',
  signing: 'contract.refusal',
  exit_preview: 'exit.refusal',
};

function isKey(key: string, locale: Locale): key is MessageKey {
  return key in messages[locale];
}

/** A refusal code as the app's own sentence where it has one without params, else the code. */
function refusalText(step: string, reason: string, t: Translate, locale: Locale): string {
  const key = `${REFUSAL_PREFIX[step] ?? 'demo.none'}.${reason}`;
  return isKey(key, locale) && !messages[locale][key].includes('{') ? t(key) : reason;
}

/**
 * One coded line as a sentence, from the message key `${prefix}.${code}`. Two codes carry
 * another slice's code inside them and are written with that slice's sentence: a decision
 * reason (`decision.reason.*`, with its own params) and a refused step (its step name and the
 * service's refusal).
 */
export function codedMessage(
  prefix: 'demo.step' | 'demo.run',
  line: CodedLine,
  t: Translate,
  locale: Locale
): string {
  if (prefix === 'demo.step' && line.code === 'application_reason') {
    const { reason, ...rest } = line.params;
    const key = `decision.reason.${reason}`;
    return isKey(key, locale)
      ? t(key, formatParams(rest, t, locale))
      : t('decision.reason.unknown', { code: String(reason) });
  }
  if (prefix === 'demo.run' && line.code === 'card_step_refused') {
    const { step, reason, ...rest } = line.params;
    const stepKey = `demo.stepName.${step}`;
    return t('demo.run.card_step_refused', {
      ...rest,
      step: isKey(stepKey, locale) ? t(stepKey) : String(step),
      reason: refusalText(String(step), String(reason), t, locale),
    });
  }
  return t(`${prefix}.${line.code}` as MessageKey, formatParams(line.params, t, locale));
}
