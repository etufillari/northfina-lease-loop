'use client';

import {
  applicationViewSchema,
  bootstrapSchema,
  contractListSchema,
  contractViewSchema,
  quoteViewSchema,
} from '@/data/spine-response-schemas';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { answersFromCustomer } from '@/domain/question-flow';
import { answersForSubmission } from './form-values';
import { getT } from '@/i18n/get-t';
import { formatIsoDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locales';
import type { ApplicationView, ContractView, QuoteView, listContracts } from '@/server/spine-views';
import { requestJson, RequestFailure } from './api';
import { useDraft } from './use-draft';
import { draftSchema, emptyDraft, emptySelection, selectionSchema } from './draft';
import { DemoControls } from './demo-controls';
import { ApplicationPanel } from './application-panel';
import { ContractPanel } from './contract-panel';
import { SavedPriceExplanation } from './saved-price-explanation';
import { EndPanel, type EndForm } from './end-panel';
import { PricePanel, type Bootstrap } from './price-panel';
import { HistoryPanel } from './history-panel';
import { WaitingListPanel } from './waiting-list-panel';
import { AssetHero } from './asset-hero';
import { buttonClass, messageFor, panelClass } from './ui';

type ContractList = Awaited<ReturnType<typeof listContracts>>;

export function CustomerJourney({ assetId, locale }: { assetId: string; locale: Locale }) {
  const t = getT(locale);
  const [selection, setSelection, selectionVolatile] = useDraft(
    'lease-loop-demo',
    emptySelection,
    selectionSchema
  );
  const draftKey = 'lease-loop:' + assetId + ':' + (selection.customerId || 'default');
  const [draft, saveDraft, draftVolatile] = useDraft(draftKey, emptyDraft, draftSchema);
  const [loaded, setLoaded] = useState<{
    signature: string;
    data: Bootstrap;
    contracts: ContractList;
  } | null>(null);
  const [contractState, setContract] = useState<{ signature: string; data: ContractView } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const activeRequest = useRef(false);
  const reviewRequest = useRef<AbortController | null>(null);
  const { customerId, businessDate } = selection;
  const signature = assetId + '|' + customerId + '|' + businessDate;
  const contractId = draft.contractId;
  const quoteId = draft.quote?.id;
  const applicationId = draft.application?.id;
  const [review, setReview] = useState<{
    signature: string;
    quote: QuoteView;
    application: ApplicationView | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const context = { customerId, businessDate };
    Promise.all([
      requestJson(
        'bootstrap?assetId=' + encodeURIComponent(assetId),
        context,
        bootstrapSchema,
        undefined,
        false,
        controller.signal
      ),
      requestJson('contracts', context, contractListSchema, undefined, false, controller.signal),
    ])
      .then(([data, contracts]) => {
        if (controller.signal.aborted) return;
        setLoaded({ signature: assetId + '|' + customerId + '|' + businessDate, data, contracts });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof RequestFailure ? cause.code : 'REQUEST_FAILED');
      });
    return () => controller.abort();
  }, [assetId, customerId, businessDate, revision]);

  useEffect(() => {
    if (!contractId) return;
    const controller = new AbortController();
    requestJson(
      'contracts/' + encodeURIComponent(contractId),
      { customerId, businessDate },
      contractViewSchema,
      undefined,
      false,
      controller.signal
    )
      .then((data) => {
        if (!controller.signal.aborted)
          setContract({ signature: assetId + '|' + customerId + '|' + businessDate, data });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof RequestFailure ? cause.code : 'REQUEST_FAILED');
      });
    return () => controller.abort();
  }, [assetId, contractId, customerId, businessDate, revision]);

  useEffect(() => {
    if (!quoteId || contractId) return;
    const controller = new AbortController();
    reviewRequest.current = controller;
    const context = { customerId, businessDate };
    Promise.all([
      requestJson(
        'quotes/' + quoteId,
        context,
        quoteViewSchema,
        undefined,
        false,
        controller.signal
      ),
      applicationId
        ? requestJson(
            'applications/' + applicationId,
            context,
            applicationViewSchema,
            undefined,
            false,
            controller.signal
          )
        : Promise.resolve(null),
    ])
      .then(([quote, application]) => {
        if (!controller.signal.aborted)
          setReview({
            signature: assetId + '|' + customerId + '|' + businessDate,
            quote,
            application,
          });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof RequestFailure ? cause.code : 'REQUEST_FAILED');
      });
    return () => controller.abort();
  }, [assetId, quoteId, applicationId, contractId, customerId, businessDate, revision]);

  const data = loaded?.signature === signature ? loaded.data : null;
  const contract =
    contractState?.signature === signature &&
    contractState.data.id === contractId &&
    contractState.data.assetId === assetId
      ? contractState.data
      : null;

  const quote =
    review?.signature === signature &&
    review.quote.id === quoteId &&
    review.quote.assetId === assetId &&
    review.quote.customerId === data?.customer.id
      ? review.quote
      : null;
  const application =
    review?.signature === signature &&
    review.application?.id === applicationId &&
    review.application?.quoteId === quote?.id
      ? review.application
      : null;

  async function run(work: () => Promise<void>) {
    if (activeRequest.current) return;
    activeRequest.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof RequestFailure ? cause.code : 'REQUEST_FAILED');
    } finally {
      activeRequest.current = false;
      setBusy(false);
    }
  }

  function requestId(action: string, payload: unknown) {
    const fingerprint = JSON.stringify(payload);
    const previous = draft.retries[action];
    const id = previous?.fingerprint === fingerprint ? previous.id : crypto.randomUUID();
    const next = { ...draft, retries: { ...draft.retries, [action]: { fingerprint, id } } };
    saveDraft(next);
    return { id, next };
  }

  function saveQuote(input: { termMonths: number; downPaymentCents: number; startDate: string }) {
    void run(async () => {
      const payload = { assetId, ...input };
      const request = requestId('quote', payload);
      const quote = await requestJson('quotes', selection, quoteViewSchema, {
        requestId: request.id,
        ...payload,
      });
      saveDraft({ ...request.next, quote, application: null, contractId: null });
    });
  }

  function apply() {
    if (!quote || !data) return;
    void run(async () => {
      const payload = {
        quoteId: quote.id,
        answers: answersForSubmission(
          data.questions,
          draft.answers ?? answersFromCustomer(data.customer)
        ),
      };
      const request = requestId('application', payload);
      const application = await requestJson('applications', selection, applicationViewSchema, {
        requestId: request.id,
        ...payload,
      });
      // The validated POST result is already canonical; do not wait for a second request.
      // An older review fetch must not overwrite this newly saved decision.
      reviewRequest.current?.abort();
      setReview({ signature, quote, application });
      // Keep raw editing values, including invalid input; the saved decision stays canonical.
      saveDraft({ ...request.next, application });
    });
  }

  function sign() {
    if (!application || application.decision !== 'approved') return;
    const approvedApplicationId = application.id;
    void run(async () => {
      const result = await requestJson('contracts/sign', selection, contractViewSchema, {
        applicationId: approvedApplicationId,
      });
      saveDraft({ ...draft, contractId: result.id });
      setContract({ signature, data: result });
    });
  }

  function issue() {
    if (!contract) return;
    void run(async () => {
      const result = await requestJson(
        'contracts/' + contract.id + '/invoices',
        selection,
        contractViewSchema,
        {}
      );
      setContract({ signature, data: result });
    });
  }

  function end(input: EndForm) {
    if (!contract) return;
    void run(async () => {
      const request = requestId('end', { contractId: contract.id, ...input });
      const result = await requestJson(
        'contracts/' + contract.id + '/end',
        selection,
        contractViewSchema,
        { requestId: request.id, ...input }
      );
      setContract({ signature, data: result });
    });
  }

  const onDate = (date: string) => {
    setSelection({ ...selection, businessDate: date });
    setError(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <Link href={'/' + locale} className="asset-back-link">
        {t('spine.back')}
      </Link>
      <AssetHero
        locale={locale}
        asset={data?.asset}
        title={data ? data.asset.make + ' ' + data.asset.model : t('spine.title')}
      />
      <DemoControls
        selection={selection}
        onChange={(next) => {
          setSelection(next);
          setError(null);
        }}
        locale={locale}
        busy={busy}
        customers={loaded?.data.customers}
        customerId={data?.customer.id}
        businessDate={data?.businessDate}
      />
      {selectionVolatile || draftVolatile ? (
        <p className={panelClass} role="status">
          {t('spine.storageWarning')}
        </p>
      ) : null}
      {error ? (
        <div className={panelClass} role="alert">
          <p>{messageFor(locale, 'spine.error.' + error)}</p>
          <button
            className={buttonClass + ' mt-3'}
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
          <WaitingListPanel
            key={`${data.customer.id}:${data.businessDate}:${data.asset.category}`}
            data={data}
            locale={locale}
            busy={busy}
            onChanged={() => setRevision((value) => value + 1)}
          />
          {loaded?.contracts.filter((item) => item.asset_id === assetId).length ? (
            <section className={panelClass}>
              <h2 className="font-semibold">{t('spine.savedContracts')}</h2>
              <ul className="mt-3 space-y-2">
                {loaded.contracts
                  .filter((item) => item.asset_id === assetId)
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        className="break-all text-left underline"
                        disabled={busy}
                        onClick={() => {
                          saveDraft({ ...draft, contractId: item.id });
                          setError(null);
                        }}
                      >
                        {t('spine.openContract')} · {item.start_date} ·{' '}
                        {messageFor(locale, 'spine.' + item.status)}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
          {contractId && !contract ? <p role="status">{t('spine.loading')}</p> : null}
          {contract ? (
            <>
              <ContractPanel
                contract={contract}
                vatRates={data.vatRates}
                locale={locale}
                busy={busy}
                onIssue={issue}
                onDate={onDate}
              />
              <EndPanel
                key={contract.id}
                contract={contract}
                data={data}
                locale={locale}
                busy={busy}
                onDate={onDate}
                onEnd={end}
              />
              {contract.status !== 'active' && data.asset.status === 'available' ? (
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => {
                    saveDraft(emptyDraft);
                    if (contract.nextCustomerId)
                      setSelection({ ...selection, customerId: contract.nextCustomerId });
                  }}
                >
                  {t('spine.nextLease')}
                </button>
              ) : null}
            </>
          ) : null}
          {!contractId && draft.quote && !quote ? <p role="status">{t('spine.loading')}</p> : null}
          {!contractId && quote ? (
            <>
              <section className={panelClass}>
                <p>{t('spine.quoteSaved', { date: formatIsoDate(quote.validThrough, locale) })}</p>
                <SavedPriceExplanation quote={quote} data={data} locale={locale} />
                <button
                  className={buttonClass + ' mt-4'}
                  disabled={busy}
                  onClick={() => {
                    saveDraft({ ...draft, quote: null, application: null, retries: {} });
                  }}
                >
                  {t('spine.editTerms')}
                </button>
              </section>
              <ApplicationPanel
                data={data}
                quote={quote}
                application={application}
                answers={draft.answers ?? answersFromCustomer(data.customer)}
                locale={locale}
                busy={busy}
                onSubmit={apply}
                onSign={sign}
                onAnswers={(answers) => {
                  saveDraft({ ...draft, answers, application: null });
                }}
              />
            </>
          ) : null}
          {!contractId && !draft.quote ? (
            <PricePanel
              data={data}
              locale={locale}
              draft={draft.terms}
              busy={busy}
              onSave={saveQuote}
              onChange={(terms) => {
                saveDraft({ ...draft, terms, application: null });
              }}
            />
          ) : null}
          {data.asset.status === 'returned' ? (
            <p className={panelClass} role="status">
              {t('spine.returnedForDealer')}
            </p>
          ) : null}
          <HistoryPanel
            assetId={assetId}
            selection={selection}
            locale={locale}
            revision={revision}
          />
        </>
      )}
    </div>
  );
}
