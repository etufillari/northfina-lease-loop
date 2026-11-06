import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { dealerWorkspaceSchema, relistViewSchema } from '@/data/spine-response-schemas';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { DealerWorkspace } from '@/server/spine-dealer';
import { requestJson, RequestFailure, type DemoSelection } from './api';
import { DemoControls } from './demo-controls';
import { AssetHero } from './asset-hero';
import { emptySelection, selectionSchema } from './draft';
import { HistoryPanel } from './history-panel';
import { RelistPanel, type RelistForm } from './relist-panel';
import { buttonClass, messageFor, panelClass } from './ui';
import { useDraft } from './use-draft';
import { DealerNextActions } from './dealer-next-actions';

const retrySchema = z.object({ fingerprint: z.string(), id: z.uuid() }).nullable();

export function DealerJourney({ assetId, locale }: { assetId: string; locale: Locale }) {
  const t = getT(locale);
  const [selection, setSelection, selectionVolatile] = useDraft(
    'lease-loop-demo',
    emptySelection,
    selectionSchema
  );
  const [retry, saveRetry, retryVolatile] = useDraft(
    'lease-loop-dealer:' + assetId,
    null,
    retrySchema
  );
  const { businessDate } = selection;
  const key = assetId + '|' + businessDate;
  const context: DemoSelection = { customerId: '', businessDate, role: 'operator' };
  const [loaded, setLoaded] = useState<{ key: string; data: DealerWorkspace } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const activeRequest = useRef(false);
  const data = loaded?.key === key ? loaded.data : null;
  const pendingSignatures =
    data?.nextActions.find(
      (action) => action.assetId === assetId && action.kind === 'awaiting_signer'
    )?.pendingSignatures ?? 0;
  const heading = data
    ? `${t('spine.dealerMode')} · ${data.asset.make} ${data.asset.model}`
    : t('spine.dealerMode');

  useEffect(() => {
    const controller = new AbortController();
    requestJson(
      'dealer?assetId=' + encodeURIComponent(assetId),
      { customerId: '', businessDate, role: 'operator' },
      dealerWorkspaceSchema,
      undefined,
      true,
      controller.signal
    )
      .then((data) => {
        if (!controller.signal.aborted) setLoaded({ key: assetId + '|' + businessDate, data });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof RequestFailure ? cause.code : 'REQUEST_FAILED');
      });
    return () => controller.abort();
  }, [assetId, businessDate, revision]);

  async function relist(input: RelistForm) {
    if (activeRequest.current) return;
    activeRequest.current = true;
    setBusy(true);
    setError(null);
    const fingerprint = JSON.stringify({ assetId, businessDate, input });
    const id = retry?.fingerprint === fingerprint ? retry.id : crypto.randomUUID();
    saveRetry({ fingerprint, id });
    try {
      await requestJson(
        'assets/' + encodeURIComponent(assetId) + '/relist',
        context,
        relistViewSchema,
        { requestId: id, ...input },
        true
      );
      if (input.matching) {
        // Keep the matched lessee selected when the user switches back to Customer.
        setSelection({ ...selection, customerId: input.matching.nextCustomerId });
      }
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof RequestFailure ? cause.code : 'REQUEST_FAILED');
    } finally {
      activeRequest.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <Link href={'/' + locale} className="asset-back-link">
        {t('spine.back')}
      </Link>
      <AssetHero locale={locale} asset={data?.asset} title={heading} />
      <DemoControls
        selection={selection}
        locale={locale}
        busy={busy}
        businessDate={data?.businessDate}
        onChange={(next) => {
          setSelection(next);
          setError(null);
        }}
      />
      {selectionVolatile || retryVolatile ? (
        <p className={panelClass} role="status">
          {t('spine.storageWarning')}
        </p>
      ) : null}
      {error ? (
        <div className={panelClass} role="alert">
          <p>{messageFor(locale, 'spine.error.' + error)}</p>
          <button
            className={buttonClass + ' mt-3'}
            disabled={busy}
            onClick={() => {
              setError(null);
              setRevision((value) => value + 1);
            }}
          >
            {t('spine.retry')}
          </button>
        </div>
      ) : null}
      {!data ? (
        <p role="status">{t('spine.loading')}</p>
      ) : (
        <>
          <DealerNextActions
            actions={data.nextActions}
            locale={locale}
            assetId={assetId}
            busy={busy}
            onRefresh={() => {
              setError(null);
              setRevision((value) => value + 1);
            }}
          />
          {pendingSignatures > 0 ? (
            <section
              id="dealer-signing-status"
              tabIndex={-1}
              className={panelClass}
              aria-labelledby="dealer-signing-heading"
            >
              <h2 id="dealer-signing-heading" className="text-xl font-semibold">
                {t('dealer.actions.link.awaiting_signer')}
              </h2>
              <p className="mt-3">{t('dealer.actions.signatures', { count: pendingSignatures })}</p>
              <p className="mt-3">{t('dealer.actions.signingNext')}</p>
              <p className="mt-3 text-sm">{t('dealer.actions.signingLimit')}</p>
            </section>
          ) : null}
          {data.asset.status === 'returned' ? (
            <RelistPanel
              key={`${assetId}:${data.releaseRevision}:${data.businessDate}`}
              data={data}
              locale={locale}
              busy={busy}
              onRelist={(input) => void relist(input)}
            />
          ) : (
            <section id="dealer-offer-status" tabIndex={-1} className={panelClass} role="status">
              <p>
                {data.asset.status === 'available' && data.offer?.source.startsWith('release:')
                  ? t('spine.dealerPublished', {
                      price: formatEuro(data.offer.priceCents, intlLocale[locale]),
                    })
                  : t('spine.dealerUnavailable')}
              </p>
              {data.valuationReason ? (
                <p className="mt-3">
                  <strong>{t('spine.valuationReason')}: </strong>
                  {data.valuationReason}
                </p>
              ) : null}
              {data.reservation.reserved ? (
                <p className="mt-3">
                  {data.reservation.customerName
                    ? t('dealer.actions.reservedFor', { name: data.reservation.customerName })
                    : t('dealer.actions.reservedUnknown')}
                </p>
              ) : null}
            </section>
          )}
          <HistoryPanel assetId={assetId} selection={context} locale={locale} revision={revision} />
        </>
      )}
    </div>
  );
}
