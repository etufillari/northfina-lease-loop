// The audit trail, as a person reads it. A server component: it renders to HTML only.
import { formatDateTime } from '@/i18n/format';
import type { MessageKey, Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { AuditLogEntry } from '@/server/audit';

const ACTION_LABELS: Record<string, MessageKey> = {
  'application.submitted': 'audit.action.applicationSubmitted',
  'application.reviewed': 'audit.action.applicationReviewed',
  'contract.signed': 'audit.action.contractSigned',
  'contract.ended': 'audit.action.contractEnded',
  'asset.status_changed': 'audit.action.assetStatusChanged',
  'asset.relisted': 'audit.action.assetRelisted',
  'asset.released': 'audit.action.assetReleased',
  'asset.held': 'audit.action.assetHeld',
  'invoice.vat_updated': 'audit.action.invoiceVatUpdated',
  'demo_date.changed': 'audit.action.demoDateChanged',
};

type AuditLogTableProps = {
  entries: readonly AuditLogEntry[];
  locale: Locale;
  t: Translate;
};

export function AuditLogTable({ entries, locale, t }: AuditLogTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-800 bg-stone-900">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead>
          <tr className="border-b border-stone-800 text-stone-400">
            <th className="px-4 py-3 font-medium">{t('audit.time')}</th>
            <th className="px-4 py-3 font-medium">{t('audit.who')}</th>
            <th className="px-4 py-3 font-medium">{t('audit.what')}</th>
            <th className="px-4 py-3 font-medium">{t('audit.record')}</th>
            <th className="px-4 py-3 font-medium">{t('audit.details')}</th>
          </tr>
        </thead>

        <tbody>
          {entries.map((entry) => {
            const label = ACTION_LABELS[entry.action];

            return (
              <tr key={entry.id} className="border-b border-stone-800 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-stone-300">
                  {formatDateTime(entry.created_at, locale)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-stone-300">{entry.actor}</td>
                <td className="px-4 py-3 text-stone-100">{label ? t(label) : entry.action}</td>
                <td className="break-all px-4 py-3 font-mono text-xs text-stone-400">
                  {entry.entity_id}
                </td>
                <td className="break-all px-4 py-3 font-mono text-xs text-stone-500">
                  {entry.details === null ? '—' : JSON.stringify(entry.details)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
