import type { AssetCategory } from '@/data/schemas';
import { categoryChecks } from '@/domain/condition-report';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { RecoveryReport } from '@/server/recovery-input';

/** What the customer told us: the problems first, with every answer one click away. */
export function CustomerReport({
  locale,
  category,
  report,
  status,
}: {
  locale: Locale;
  category: AssetCategory;
  report: RecoveryReport | null;
  status: string;
}) {
  const t = getT(locale);
  const part = (key: string, answer: string) =>
    t((answer === 'unknown' ? 'flow.answer.unknown' : `flow.part.${key}.${answer}`) as MessageKey);
  const answers = report?.answers;
  const rows: [string, string][] = report
    ? [
        [t(`product.usage.${category}`), String(report.usageValue)],
        ...(answers
          ? ([
              ...(category === 'laptop'
                ? []
                : [[t('flow.step.power'), part('power', answers.power)]]),
              ...(category === 'farm_machine'
                ? []
                : [
                    [
                      t('flow.step.battery'),
                      answers.batteryKnown && answers.batteryHealth !== null
                        ? `${answers.batteryHealth} %`
                        : t('flow.unable'),
                    ],
                  ]),
              ...categoryChecks[category].map((key) => [
                t(`flow.check.${key}` as MessageKey),
                part(key, answers.functions[key] ?? 'unknown'),
              ]),
              [t('flow.step.cosmetic'), t(`flow.cosmetic.${answers.cosmetic}`)],
              [t('flow.accessories'), t(`flow.accessories.${answers.accessories}`)],
            ] as [string, string][])
          : []),
        ...(report.preferredDate
          ? ([[t('return.preferredDate'), report.preferredDate]] as [string, string][])
          : []),
      ]
    : [];
  return (
    <section className="rounded-lg bg-parchment p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-tagline font-semibold">{t('recovery.report')}</h2>
        <span className="rounded-pill bg-canvas px-3 py-1 text-caption">
          {t(`recovery.state.${status}` as MessageKey)}
        </span>
      </div>
      {report ? (
        <>
          {report.issues.length ? (
            <ul className="mt-5 space-y-2 text-body">
              {report.issues.map((issue) => (
                <li key={issue}>• {t(`return.issue.${issue}` as MessageKey)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-body">{t('recovery.noProblems')}</p>
          )}
          {report.notes ? (
            <p className="mt-4 whitespace-pre-wrap text-body text-ink-muted">“{report.notes}”</p>
          ) : null}
          <details className="mt-4 border-t border-hairline pt-3">
            <summary className="flex min-h-target cursor-pointer items-center text-caption font-semibold text-primary">
              {t('recovery.allAnswers')}
            </summary>
            <dl className="mt-2 divide-y divide-hairline">
              {rows.map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2">
                  <dt className="text-caption text-ink-muted">{label}</dt>
                  <dd className="text-caption font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      ) : (
        <p className="mt-4 text-caption text-ink-muted">{t('recovery.noReport')}</p>
      )}
    </section>
  );
}
