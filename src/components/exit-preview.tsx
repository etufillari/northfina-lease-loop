// The cost of one exit, line by line (D14): each line is a code with params from the server's
// plan, written here in the visitor's language with formatEuro. No hooks and no server
// imports, so the client exit form renders it as the customer changes the condition.
import type { ExitLine, ExitOption } from '@/domain/exits';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import { messages, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { cx } from './ui';

/** A data id (a refurbishment step) as a message key, or the id itself when there is none. */
function stepName(id: string, t: Translate): string {
  const key = `exit.step.${id}`;
  return key in messages.en ? t(key as MessageKey) : id;
}

const conditionName = (value: string | number, t: Translate) =>
  t(`condition.${value}` as MessageKey).toLowerCase();

/** One line's text: amounts as euros, conditions and steps by name, numbers by locale. */
export function exitLineText(line: ExitLine, locale: Locale, t: Translate): string {
  const p = line.params;
  const number = (value: string | number | undefined) =>
    typeof value === 'number' ? formatNumber(value, locale) : String(value ?? '');
  const values: Record<string, string | number> = {
    months: number(p.months),
    termMonths: number(p.termMonths),
    ageMonths: number(p.ageMonths),
    curvePercent: number(p.curvePercent),
    usageAdjustmentPercent: number(p.usageAdjustmentPercent),
    conditionMultiplier: number(p.conditionMultiplier),
    times: number(p.times),
  };
  if (typeof p.amountCents === 'number') {
    values.amount = formatEuro(p.amountCents, intlLocale[locale]);
  }
  if (p.condition !== undefined) values.condition = conditionName(p.condition, t);
  if (p.from !== undefined) values.from = conditionName(p.from, t);
  if (p.to !== undefined) values.to = conditionName(p.to, t);
  if (typeof p.step === 'string') values.step = stepName(p.step, t);
  if (typeof p.usageValue === 'number' && typeof p.usageUnit === 'string') {
    values.usage = t(`usage.${p.usageUnit}` as MessageKey, { value: number(p.usageValue) });
  }
  const key =
    line.code === 'refurb_fixed' && p.times !== 1
      ? 'exit.line.refurb_fixed_times'
      : `exit.line.${line.code}`;
  return t(key as MessageKey, values);
}

type ExitOptionListProps = {
  title: string;
  option: ExitOption;
  locale: Locale;
  t: Translate;
  /** The option the customer has chosen. */
  chosen?: boolean;
  /** A short line under the title, e.g. that the numbers are an estimate until answered. */
  note?: string;
};

const sign: Record<ExitLine['effect'], string> = {
  add: '',
  subtract: '−',
  subtotal: '=',
  info: '',
  total: '=',
};

export function ExitOptionList({ title, option, locale, t, chosen, note }: ExitOptionListProps) {
  return (
    <section
      aria-label={title}
      className={cx('rounded-lg p-4 ring-1', chosen ? 'bg-raised ring-brand' : 'ring-line')}
    >
      <h3 className={cx('font-medium', note ? 'mb-1' : 'mb-3')}>{title}</h3>
      {note ? <p className="mb-3 text-xs text-ink-muted">{note}</p> : null}
      <ul className="space-y-2 text-sm">
        {option.lines.map((line, index) => {
          const amount = line.params.amountCents;
          const muted = line.effect === 'info';
          const strong = line.effect === 'total' || line.effect === 'subtotal';
          return (
            <li
              key={`${line.code}-${index}`}
              className={cx(
                'flex items-baseline justify-between gap-3',
                muted && 'text-ink-muted',
                strong && 'border-t border-line pt-2',
                line.effect === 'total' && 'font-semibold'
              )}
            >
              <span>{exitLineText(line, locale, t)}</span>
              {typeof amount === 'number' && line.code !== 'value_exceeds_balance' ? (
                <span className="shrink-0 tabular-nums">
                  {sign[line.effect]} {formatEuro(amount, intlLocale[locale])}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
