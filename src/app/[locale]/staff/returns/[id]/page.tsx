import Link from 'next/link';
import { loadVatRates } from '@/data/load';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { RecoveryWorkbench } from '@/components/recovery-workbench';
import { SecondLifePanel } from '@/components/second-life-panel';
import { recoveryAgeMonths } from '@/domain/asset-recovery';
import { agreedReturnTotalCents } from '@/domain/lease-settlement';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { leaseActionContext } from '@/server/lease-actions';
import { findReturnCase } from '@/server/recovery';
import {
  inspectionSchema,
  recoveryCalculationSchema,
  recoveryReportSchema,
} from '@/server/recovery-input';
import { relistOfferFor, secondLifePlanFor } from '@/server/relisting';
import { appToday } from '@/server/demo-mode';

export default async function Page({ params }: PageProps<'/[locale]/staff/returns/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  if (identity.role !== 'staff') notFound();
  const request = await findReturnCase(db, id);
  if (!request) notFound();
  const report = request.customerReportJson
    ? recoveryReportSchema.parse(JSON.parse(request.customerReportJson))
    : null;
  const inspection = request.assessment
    ? inspectionSchema.parse(JSON.parse(request.assessment.inspectionJson))
    : null;
  const calculation = request.assessment
    ? recoveryCalculationSchema.parse(JSON.parse(request.assessment.calculationJson))
    : null;
  const firstDate = request.contract.asset.firstLeaseDate ?? request.contract.startDate;
  const today = await appToday();
  const vat = await loadVatRates();
  const rate = vat.rates.find(
    (rate) => rate.valid_from <= today && (rate.valid_to === null || rate.valid_to >= today)
  );
  const vatBasisPoints = rate ? Math.round(rate.rate_percent * 100) : 0;
  const saved = request.assessment?.status ?? 'pending';
  // 'received' only remains on cases saved before receipt made an item ready.
  const status = saved === 'received' ? 'ready' : saved;
  const offer = status === 'ready' ? await relistOfferFor(db, id, today).catch(() => null) : null;
  const context =
    request.contract.status === 'active'
      ? await leaseActionContext(db, request.contract.customerId, request.contract.id, today).catch(
          () => null
        )
      : null;
  const agreedPrice = request.kind === 'buyout' ? undefined : report?.agreedPrice;
  const agreed = agreedPrice
    ? {
        totalCents: agreedReturnTotalCents(agreedPrice, context?.finance.outstandingCents ?? 0),
        lines: agreedPrice.lines,
      }
    : null;
  // Card 9: only once the item is back, while it can still go to someone on the waiting list.
  const plan = offer ? await secondLifePlanFor(db, id, today).catch(() => null) : null;
  const t = getT(locale);
  const itemName = `${request.contract.asset.make} ${request.contract.asset.model}`;
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <Link
        href={`/${locale}/staff/returns`}
        className="inline-flex min-h-target items-center text-caption text-primary"
      >
        ← {t('recovery.queue')}
      </Link>
      <h1 className="mt-4 font-display text-display-sm font-semibold">{itemName}</h1>
      <p className="mt-3 text-caption text-ink-muted">
        {request.contract.customer.owner.name} · {request.contract.asset.serial_number}
      </p>
      <RecoveryWorkbench
        key={request.assessment?.updatedAt.toISOString() ?? 'new'}
        vatBasisPoints={vatBasisPoints}
        locale={locale}
        requestId={id}
        kind={request.kind}
        assetId={request.contract.asset.id}
        itemName={itemName}
        offer={offer}
        returnContext={
          context && {
            baselineCondition: context.baselineCondition,
            finance: context.finance,
            recoveryFacts: context.recoveryFacts,
            costs: context.costs,
            curves: context.curves,
          }
        }
        agreed={agreed}
        quoteExpired={calculation !== null && calculation.quoteDate !== today}
        publishedPriceCents={request.assessment?.publishedPriceCents ?? null}
        category={request.contract.asset.category as 'e_bike' | 'laptop' | 'farm_machine'}
        report={report}
        inspection={inspection}
        calculation={calculation}
        status={status}
        currentUsage={request.contract.asset.usage_value}
        recordedAge={
          request.contract.asset.firstLeaseDate ? recoveryAgeMonths(firstDate, today) : null
        }
        defaultAge={recoveryAgeMonths(firstDate, today)}
      />
      {plan ? <SecondLifePanel plan={plan} locale={locale} /> : null}
    </div>
  );
}
