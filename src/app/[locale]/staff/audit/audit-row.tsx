// One audit row: time in Helsinki, the actor (with the customer's name when we know it), a
// plain-language action, a link to the record, and the details as labelled values.
import Link from 'next/link';
import { formatEuro } from '@/domain/money';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { AuditLogEntry } from '@/server/audit';
import { formatDateTime } from '@/i18n/format';

/** Where a record of each type can be opened; customers have no page of their own. */
const RECORD_PATH: Record<string, string> = {
  application: 'apply',
  contract: 'contracts',
  asset: 'assets',
};

/** The translated label for an action, or the raw code for actions added later. */
function actionLabel(locale: Locale, action: string): string {
  const key = `staff.audit.action.${action}`;
  return key in messages[locale] ? getT(locale)(key as MessageKey) : action;
}

/** A detail value as short text. Keys ending in `Cents` are money: shown as euros. */
function detailValue(key: string, value: unknown, locale: Locale): string {
  if (typeof value === 'number' && Number.isInteger(value) && /cents$/i.test(key)) {
    return formatEuro(value, intlLocale[locale]);
  }
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function detailEntries(details: unknown): Array<[string, unknown]> {
  if (details === null || details === undefined) return [];
  if (typeof details !== 'object' || Array.isArray(details)) return [['value', details]];
  return Object.entries(details as Record<string, unknown>).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );
}

export function AuditRow({
  row,
  locale,
  actorName,
  asOfParam,
  filterHref,
}: {
  row: AuditLogEntry;
  locale: Locale;
  actorName: string | null;
  asOfParam: string | null;
  filterHref: string;
}) {
  const t = getT(locale);
  const when = formatDateTime(row.created_at, locale);
  const path = RECORD_PATH[row.entity_type];
  const recordHref = path
    ? `/${locale}/${path}/${row.entity_id}${asOfParam ? `?asOf=${asOfParam}` : ''}`
    : null;
  const typeKey = `staff.audit.type.${row.entity_type}`;
  const typeLabel = typeKey in messages[locale] ? t(typeKey as MessageKey) : row.entity_type;
  const details = detailEntries(row.details);

  return (
    <tr className="align-top">
      <td className="px-4 py-3 whitespace-nowrap text-stone-600 dark:text-stone-400">
        <time dateTime={row.created_at}>{when}</time>
      </td>
      <td className="px-4 py-3">
        <span className="font-medium">{actorName ?? row.actor}</span>
        {actorName ? <span className="block text-xs text-stone-500">{row.actor}</span> : null}
      </td>
      <td className="px-4 py-3">
        <span className="font-medium">{actionLabel(locale, row.action)}</span>
        <code className="block text-xs text-stone-500">{row.action}</code>
      </td>
      <td className="px-4 py-3">
        <span className="block text-xs text-stone-500">{typeLabel}</span>
        {recordHref ? (
          <Link
            href={recordHref}
            className="font-mono text-xs break-all text-emerald-800 hover:underline dark:text-emerald-300"
          >
            {row.entity_id}
          </Link>
        ) : (
          <span className="font-mono text-xs break-all">{row.entity_id}</span>
        )}
        <Link
          href={filterHref}
          className="mt-1 block text-xs text-stone-600 underline dark:text-stone-400"
        >
          {t('staff.audit.history')}
        </Link>
      </td>
      <td className="px-4 py-3">
        {details.length === 0 ? (
          <span className="text-stone-400">—</span>
        ) : (
          <dl className="flex flex-wrap gap-1.5">
            {details.map(([key, value]) => (
              <div
                key={key}
                className="rounded-md bg-stone-100 px-2 py-0.5 text-xs dark:bg-stone-800"
              >
                <dt className="inline text-stone-500">{key}: </dt>
                <dd className="inline font-medium break-all">{detailValue(key, value, locale)}</dd>
              </div>
            ))}
          </dl>
        )}
      </td>
    </tr>
  );
}
