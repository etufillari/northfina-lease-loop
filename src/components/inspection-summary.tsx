import type { AssetCategory } from '@/data/schemas';
import { inspectionReadings, type InspectionRecord } from '@/domain/inspection';
import { formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

/** The saved findings, for everyone working on the item after the assessment. */
export function InspectionSummary({
  locale,
  category,
  record,
  notes,
}: {
  locale: Locale;
  category: AssetCategory;
  record: InspectionRecord;
  notes: string;
}) {
  const t = getT(locale);
  const findings = record.checks.filter((check) => ['wear', 'not_tested'].includes(check.result));
  const damage = record.damage.filter((entry) => entry.repairCents === 0);
  const units = new Map(inspectionReadings(category).map((item) => [item.id, item.unit]));
  const unitOf = (id: string) => units.get(id) ?? 'count';
  const readings = record.readings.filter((reading) => reading.value !== null);
  return (
    <section className="rounded-lg border border-hairline p-6">
      <h2 className="text-tagline font-semibold">{t('inspection.summary')}</h2>
      {notes ? <p className="mt-3 whitespace-pre-wrap text-body">{notes}</p> : null}
      {record.customerPresent ? (
        <p className="mt-3 text-caption text-ink-muted">{t('inspection.customerPresent')}</p>
      ) : null}
      {findings.length ? (
        <ul className="mt-5 divide-y divide-divider">
          {findings.map((check) => (
            <li key={check.id} className="flex justify-between gap-4 py-3 text-caption">
              <span>
                <strong className="font-semibold">
                  {t(`inspection.check.${check.id}` as MessageKey)}
                </strong>{' '}
                · {t(`inspection.result.${check.result}`)}
                {check.note ? <span className="block text-ink-muted">{check.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {readings.length ? (
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          {readings.map((reading) => (
            <div key={reading.id}>
              <dt className="text-caption text-ink-muted">
                {t(`inspection.reading.${reading.id}` as MessageKey)}
              </dt>
              <dd className="mt-1 font-semibold">
                {formatNumber(reading.value!, locale)}
                {unitOf(reading.id) === 'count'
                  ? ''
                  : ` ${t(`inspection.unit.${unitOf(reading.id)}`)}`}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {damage.length ? (
        <>
          <h3 className="mt-5 text-caption font-semibold">{t('inspection.section.damage')}</h3>
          <ul className="mt-2 divide-y divide-divider">
            {damage.map((entry, index) => (
              <li key={index} className="flex justify-between gap-4 py-3 text-caption">
                <span>
                  {entry.area} · {t(`inspection.damage.${entry.type}`)} ·{' '}
                  {t(`inspection.liability.${entry.liability}`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
