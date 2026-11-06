'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AssetCategory } from '@/data/schemas';
import type { RelistOffer } from '@/domain/relist-offer';
import type { ReturnPreviewContext } from '@/domain/return-preview';
import { invoiceAmounts } from '@/domain/lease-billing';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type {
  RecoveryCalculation,
  RecoveryInspection,
  RecoveryReport,
} from '@/server/recovery-input';
import { CustomerReport } from './customer-report';
import { primaryButtonClass } from './form-classes';
import { InspectionForm } from './inspection-form';
import { InspectionSummary } from './inspection-summary';
import { RelistPanel } from './relist-panel';
import { WorkPlan, workLines } from './work-plan';

type Props = {
  locale: Locale;
  requestId: string;
  kind: string;
  assetId: string;
  itemName: string;
  category: AssetCategory;
  report: RecoveryReport | null;
  inspection: RecoveryInspection | null;
  calculation: RecoveryCalculation | null;
  status: string;
  currentUsage: number;
  recordedAge: number | null;
  defaultAge: number;
  vatBasisPoints: number;
  offer: RelistOffer | null;
  returnContext: ReturnPreviewContext | null;
  agreed: { totalCents: number; lines: readonly { id: string; netCents: number }[] } | null;
  publishedPriceCents: number | null;
  quoteExpired: boolean;
};

export function RecoveryWorkbench({
  locale,
  requestId,
  kind,
  assetId,
  itemName,
  category,
  report,
  inspection,
  calculation,
  status,
  currentUsage,
  recordedAge,
  defaultAge,
  vatBasisPoints,
  offer,
  returnContext,
  agreed,
  publishedPriceCents,
  quoteExpired,
}: Props) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'general' | 'price' | null>(null);
  const [changingQuote, setChangingQuote] = useState(false);
  const currency = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const quoteGross = (cents: number) =>
    invoiceAmounts(Math.max(0, cents), calculation?.vatBasisPoints ?? vatBasisPoints).totalCents;
  const todayGross = (cents: number) =>
    invoiceAmounts(Math.max(0, cents), vatBasisPoints).totalCents;

  async function send(body: unknown, { backToTop = false } = {}) {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/staff/returns/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const code = (payload as { error?: { code?: string } } | null)?.error?.code;
        setFailure(code === 'PRICE_CHANGED' ? 'price' : 'general');
        // The panel must now show the price staff are actually being asked to accept.
        if (code === 'PRICE_CHANGED') router.refresh();
        return;
      }
      // Staff are at the bottom of a long form, far from the confirmation that replaces it.
      if (backToTop) window.scrollTo(0, 0);
      router.refresh();
    } catch {
      setFailure('general');
    } finally {
      setBusy(false);
    }
  }

  const showForm = status === 'pending' || (status === 'quoted' && changingQuote);
  const published = status === 'published';
  const priceNet = publishedPriceCents ?? offer?.priceNetCents ?? null;
  return (
    <div className="mt-8 grid items-start gap-8 desktop:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        <CustomerReport locale={locale} category={category} report={report} status={status} />

        {status === 'quoted' && !changingQuote ? (
          <section role="status" className="rounded-lg border border-hairline p-6">
            <h2 className="text-tagline font-semibold">
              {t(quoteExpired ? 'recovery.quoteExpired.title' : 'recovery.quoteSent.title')}
            </h2>
            <p className="mt-3 text-body text-ink-muted">
              {t(quoteExpired ? 'recovery.quoteExpired' : 'recovery.quoteSent')}
            </p>
            <button
              type="button"
              onClick={() => setChangingQuote(true)}
              className="mt-3 min-h-target text-caption font-semibold text-primary underline"
            >
              {t('recovery.editInspection')}
            </button>
          </section>
        ) : null}

        {showForm ? (
          <InspectionForm
            locale={locale}
            category={category}
            reportedIssues={report?.issues ?? []}
            reportedCondition={report?.condition ?? null}
            reportedUsage={report?.usageValue ?? null}
            inspection={inspection}
            currentUsage={currentUsage}
            recordedAge={recordedAge}
            defaultAge={defaultAge}
            vatBasisPoints={vatBasisPoints}
            returnContext={returnContext}
            agreed={agreed}
            busy={busy}
            failed={failure === 'general'}
            onSubmit={(body) => void send(body, { backToTop: true })}
          />
        ) : null}

        {/* The assessment is finished work by now, so it stays out of the way until someone asks. */}
        {calculation && status !== 'bought' ? (
          <details>
            <summary className="flex min-h-target cursor-pointer items-center text-caption font-semibold text-primary">
              {t('recovery.assessmentDetails')}
            </summary>
            <div className="mt-4 space-y-8">
              <WorkPlan
                locale={locale}
                workItems={calculation.recovery.workItems}
                record={inspection?.record}
                currency={(net) => currency(quoteGross(net))}
              />
              {!showForm && inspection?.record ? (
                <InspectionSummary
                  locale={locale}
                  category={category}
                  record={inspection.record}
                  notes={inspection.notes}
                />
              ) : null}
            </div>
          </details>
        ) : null}
      </div>

      <aside className="rounded-lg bg-parchment p-6">
        <h2 className="text-tagline font-semibold">{t('recovery.numbers')}</h2>
        {calculation ? (
          <>
            <p className="mt-5 text-caption text-ink-muted">
              {t(
                published
                  ? 'relist.listedAt'
                  : priceNet !== null
                    ? 'relist.priceToday'
                    : 'recovery.customerPays'
              )}
            </p>
            <p className="mt-2 font-display text-display-lg font-semibold">
              {currency(
                priceNet !== null
                  ? todayGross(priceNet)
                  : kind === 'buyout'
                    ? calculation.settlement.buyoutTotalCents
                    : calculation.settlement.returnTotalCents
              )}
            </p>
            <p className="mt-1 text-caption text-ink-muted">{t('pricing.includesVat')}</p>
            {published ? (
              <Link
                href={`/${locale}/products/${assetId}`}
                className="mt-3 inline-flex min-h-target items-center text-caption text-primary"
              >
                {t('relist.viewListing')}
              </Link>
            ) : null}
            {status === 'ready' && offer ? (
              <RelistPanel
                key={offer.priceNetCents}
                locale={locale}
                itemName={itemName}
                offer={offer}
                work={workLines(locale, calculation.recovery.workItems, inspection?.record)}
                vatBasisPoints={vatBasisPoints}
                busy={busy}
                priceChanged={failure === 'price'}
                onPublish={(expectedPriceCents) =>
                  void send({ action: 'publish', expectedPriceCents })
                }
                onRetire={() => void send({ action: 'retire' })}
              />
            ) : null}
            {offer && !published ? (
              <dl className="mt-6 space-y-5">
                <Fact
                  label={t('recovery.refurbCost')}
                  value={currency(todayGross(offer.refurbishmentCostCents))}
                />
                {offer.customerRepairCents > 0 ? (
                  <Fact
                    label={t('relist.customerRepairs')}
                    value={`−${currency(todayGross(offer.customerRepairCents))}`}
                  />
                ) : null}
                <Fact
                  label={t('relist.netResult')}
                  value={`${offer.netResultCents < 0 ? '−' : ''}${currency(todayGross(Math.abs(offer.netResultCents)))}`}
                />
              </dl>
            ) : null}
            {priceNet === null ? (
              <dl className="mt-6 space-y-5">
                <Fact
                  label={t('flow.endingEarly')}
                  value={currency(quoteGross(calculation.settlement.earlyReturnNetCents))}
                />
                <Fact
                  label={t('flow.yourRepairShare', {
                    percent: Math.round(calculation.settlement.repairShareBasisPoints / 100),
                  })}
                  value={currency(quoteGross(calculation.settlement.customerRepairNetCents))}
                />
              </dl>
            ) : null}
            {status === 'accepted' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ action: 'receive' })}
                className={`${primaryButtonClass} mt-6 w-full`}
              >
                {t('recovery.receive')}
              </button>
            ) : null}
          </>
        ) : agreed ? (
          <>
            <p className="mt-5 text-caption text-ink-muted">{t('recovery.agreedPrice')}</p>
            <p className="mt-2 font-display text-display-lg font-semibold">
              {currency(agreed.totalCents)}
            </p>
            <p className="mt-1 text-caption text-ink-muted">{t('pricing.includesVat')}</p>
          </>
        ) : (
          <p className="mt-5 text-body text-ink-muted">{t('recovery.beforeQuote')}</p>
        )}
        {failure === 'general' && !showForm ? (
          <p
            role="alert"
            className="mt-5 rounded-sm border border-hairline bg-canvas p-4 text-caption"
          >
            {t('recovery.error')}
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
