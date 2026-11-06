import type { InspectionRecord } from '@/domain/inspection';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export type WorkLine = {
  key: string;
  title: string;
  detail: string;
  cents: number;
  customerPays: boolean;
};

/**
 * The concrete jobs: the repairs the inspection found, then the standard tasks. The single
 * "additional repairs" total is replaced by the lines behind it whenever they exist.
 */
export function workLines(
  locale: Locale,
  workItems: readonly { id: string; costCents: number }[],
  record: InspectionRecord | undefined
): WorkLine[] {
  const t = getT(locale);
  const repairs = (record?.checks ?? [])
    .filter((check) => check.result === 'repair')
    .map((check) => ({
      key: check.id,
      title: t(`inspection.check.${check.id}` as MessageKey),
      detail: check.note,
      cents: check.repairCents,
      customerPays: check.chargeable !== false && check.repairCents > 0,
    }));
  const damage = (record?.damage ?? [])
    .filter((entry) => entry.repairCents > 0)
    .map((entry, index) => ({
      key: `damage-${index}`,
      title: entry.area,
      detail: t(`inspection.damage.${entry.type}`),
      cents: entry.repairCents,
      customerPays: entry.liability === 'chargeable',
    }));
  const standard = workItems
    .filter((item) => !record || item.id !== 'additional_repair')
    .map((item) => ({
      key: item.id,
      title: t(`recovery.task.${item.id}` as MessageKey),
      detail: '',
      cents: item.costCents,
      customerPays: false,
    }));
  return [...repairs, ...damage, ...standard];
}

export function WorkPlan({
  locale,
  workItems,
  record,
  currency,
}: {
  locale: Locale;
  workItems: readonly { id: string; costCents: number }[];
  record: InspectionRecord | undefined;
  currency: (netCents: number) => string;
}) {
  const t = getT(locale);
  const lines = workLines(locale, workItems, record);
  const total = lines.reduce((sum, line) => sum + line.cents, 0);
  return (
    <section className="rounded-lg border border-hairline p-6">
      <h2 className="text-tagline font-semibold">{t('recovery.work')}</h2>
      <ul className="mt-4 divide-y divide-divider">
        {lines.map((line) => (
          <li key={line.key} className="flex justify-between gap-4 py-3 text-caption">
            <span>
              <span className="font-semibold">{line.title}</span>
              {line.detail ? <span className="block text-ink-muted">{line.detail}</span> : null}
              {line.customerPays ? (
                <span className="block text-ink-muted">{t('recovery.customerLine')}</span>
              ) : null}
            </span>
            <span className="shrink-0">{line.cents ? currency(line.cents) : '—'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between gap-4 border-t border-hairline pt-3 font-semibold">
        <span>{t('recovery.workTotal')}</span>
        <span className="shrink-0">{currency(total)}</span>
      </p>
    </section>
  );
}
