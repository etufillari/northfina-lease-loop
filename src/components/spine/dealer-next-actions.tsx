import Link from 'next/link';
import type { DealerNextAction } from '@/domain/dealer-next-actions';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { messageFor, panelClass, secondaryButtonClass } from './ui';

const anchors = {
  awaiting_signer: 'dealer-signing-status',
  prepare_item: 'relist-heading',
  offer_ready: 'dealer-offer-status',
};

export function DealerNextActions({
  actions,
  locale,
  assetId,
  busy,
  onRefresh,
}: {
  actions: readonly DealerNextAction[];
  locale: Locale;
  assetId: string;
  busy: boolean;
  onRefresh: () => void;
}) {
  const t = getT(locale);
  return (
    <section className={panelClass} aria-labelledby="dealer-attention-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="dealer-attention-heading" className="text-xl font-semibold">
          {t('dealer.actions.title')}
        </h2>
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onRefresh}>
          {t('dealer.actions.refresh')}
        </button>
      </div>
      <p className="mt-3 text-sm">{t('dealer.actions.help')}</p>
      <p className="sr-only" role="status">
        {t('dealer.actions.count', { count: actions.length })}
      </p>
      {actions.length === 0 ? (
        <p className="mt-4">{t('dealer.actions.empty')}</p>
      ) : (
        <details className="mt-4">
          <summary className="font-semibold">
            {t('dealer.actions.count', { count: actions.length })}
          </summary>
          <ol className="mt-3 divide-y divide-stone-200 dark:divide-stone-700">
            {actions.map((action) => (
              <li
                key={action.assetId}
                className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <h3 className="font-semibold break-words">
                    {action.make} {action.model}
                  </h3>
                  <p className="text-sm break-all">{action.assetId}</p>
                  <p className="mt-2">
                    {messageFor(locale, 'dealer.actions.reason.' + action.kind)}
                  </p>
                  {action.pendingSignatures > 0 ? (
                    <p className="mt-1 text-sm">
                      {t('dealer.actions.signatures', { count: action.pendingSignatures })}
                    </p>
                  ) : null}
                </div>
                {busy ? (
                  <span>{messageFor(locale, 'dealer.actions.link.' + action.kind)}</span>
                ) : (
                  <Link
                    className={secondaryButtonClass}
                    href={
                      '/' +
                      locale +
                      '/lease/' +
                      encodeURIComponent(action.assetId) +
                      '#' +
                      anchors[action.kind]
                    }
                    aria-label={t('dealer.actions.open', {
                      action: messageFor(locale, 'dealer.actions.link.' + action.kind),
                      item: action.make + ' ' + action.model + ' · ' + action.assetId,
                    })}
                    aria-current={action.assetId === assetId ? 'location' : undefined}
                  >
                    {messageFor(locale, 'dealer.actions.link.' + action.kind)}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
