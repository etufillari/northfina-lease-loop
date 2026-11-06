import { auditSchema, passportSchema } from '@/data/spine-response-schemas';
import { useEffect, useState } from 'react';
import type { getPassport, getScopedAudit } from '@/server/spine-history';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { requestJson, type DemoSelection } from './api';
import { messageFor, panelClass } from './ui';

type Passport = Awaited<ReturnType<typeof getPassport>>;
type Audit = Awaited<ReturnType<typeof getScopedAudit>>;

export function HistoryPanel({
  assetId,
  selection,
  locale,
  revision,
}: {
  assetId: string;
  selection: DemoSelection;
  locale: Locale;
  revision: number;
}) {
  const t = getT(locale);
  const { customerId, businessDate, role = 'customer' } = selection;
  const key = assetId + '|' + customerId + '|' + businessDate + '|' + role;
  const [loaded, setLoaded] = useState<{ key: string; passport: Passport; audit: Audit } | null>(
    null
  );
  const [failedKey, setFailedKey] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const context = { customerId, businessDate, role };
    Promise.all([
      requestJson(
        'assets/' + encodeURIComponent(assetId) + '/passport',
        context,
        passportSchema,
        undefined,
        false,
        controller.signal
      ),
      requestJson('audit', context, auditSchema, undefined, false, controller.signal),
    ])
      .then(([passport, audit]) => {
        if (!controller.signal.aborted)
          setLoaded({
            key: assetId + '|' + customerId + '|' + businessDate + '|' + role,
            passport,
            audit,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setFailedKey(assetId + '|' + customerId + '|' + businessDate + '|' + role);
      });
    return () => controller.abort();
  }, [assetId, customerId, businessDate, role, revision]);
  const state = loaded?.key === key ? loaded : null;
  const auditTime = new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Helsinki',
  });
  return (
    <section className={panelClass} aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-xl font-semibold">
        {t('spine.passport')}
      </h2>
      <p className="mt-2 text-sm">{t('spine.historyHelp')}</p>
      {failedKey === key && !state ? <p role="alert">{t('spine.error')}</p> : null}
      {state ? (
        <>
          {state.passport.earlierLivesWithoutRecords > 0 ? (
            <p className="mt-3">
              {t('spine.previousUnknown', { count: state.passport.earlierLivesWithoutRecords })}
            </p>
          ) : null}
          <ol className="mt-4 space-y-2">
            {state.passport.lives.map((life) => (
              <li key={life.life_number}>
                {t('spine.life', { count: life.life_number })} · {life.start_date} →{' '}
                {life.closed_on ?? life.end_date} · {messageFor(locale, 'spine.' + life.status)}
              </li>
            ))}
          </ol>
          {!state.passport.lives.length ? <p className="mt-3">{t('spine.noHistory')}</p> : null}
          <h3 id="audit-heading" className="mt-6 text-lg font-semibold">
            {t('spine.audit')}
          </h3>
          <div
            className="mt-3 overflow-x-auto"
            role="region"
            aria-labelledby="audit-heading"
            tabIndex={0}
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="p-2">
                    {t('spine.auditTime')}
                  </th>
                  <th scope="col" className="p-2">
                    {t('spine.auditAction')}
                  </th>
                  <th scope="col" className="p-2">
                    {t('spine.auditActor')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.audit.map((row) => (
                  <tr key={row.id}>
                    <td className="border-t border-stone-200 p-2">
                      <time dateTime={row.at}>{auditTime.format(new Date(row.at))}</time>
                    </td>
                    <td className="border-t border-stone-200 p-2">
                      {messageFor(locale, 'spine.action.' + row.action, 'spine.audit')}
                    </td>
                    <td className="border-t border-stone-200 p-2 break-all">{row.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-3" role="status">
          {t('spine.loading')}
        </p>
      )}
    </section>
  );
}
