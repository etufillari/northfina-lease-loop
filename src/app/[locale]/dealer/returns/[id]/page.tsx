// One return: who and what, how far along it is, and the one action the dealer can take now.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { buildActionTexts, buildReserveTexts } from '@/components/dealer/action-texts';
import { InspectionForm } from '@/components/dealer/inspection-form';
import { PlanForm } from '@/components/dealer/plan-form';
import { ActionButton } from '@/components/dealer/action-button';
import { SecondLifeCard } from '@/components/dealer/second-life-card';
import { RefurbishmentPlanCard } from '@/components/dealer/refurbishment-plan-card';
import { ReturnStatusBadge } from '@/components/dealer/return-status-badge';
import { WorkflowTimeline } from '@/components/dealer/workflow-timeline';
import {
  defaultPlanTarget,
  planTargetOptions,
  returnTimeline,
  type WorkflowStep,
} from '@/domain/return-workflow';
import { assetConditionSchema } from '@/data/schemas';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { ApiError } from '@/server/api-response';
import { db } from '@/server/db';
import { getReturnRequest } from '@/server/return-queries';
import { getSecondLifeSection } from '@/server/second-life-view';
import { todayIso } from '@/server/today';

export default async function ReturnDetailPage({
  params,
}: PageProps<'/[locale]/dealer/returns/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const detail = await getReturnRequest(db, id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });

  const t = getT(locale);
  const texts = buildActionTexts(t);
  const usageSinceLastService = detail.inspection?.usageSinceLastService ?? undefined;

  // Second life: the reservation if there is one, else the decision for an item waiting to be matched.
  const secondLife = await getSecondLifeSection(db, {
    assetId: detail.asset.id,
    today: todayIso(),
    usageSinceLastService,
  });

  // The plan should start from what the next customer needs: the reservation's or the winner's target.
  const planOptions = detail.inspection ? planTargetOptions(detail.inspection.condition) : [];
  const suggestedTarget =
    secondLife.kind === 'reserved'
      ? secondLife.reservation.targetCondition
      : secondLife.kind === 'preview'
        ? secondLife.preview.matches.find(
            (match) => match.requestId === secondLife.preview.decision.winnerRequestId
          )?.targetCondition
        : undefined;
  const assetName = `${detail.asset.make} ${detail.asset.model}`;
  const conditionOptions = (values: readonly string[]) =>
    values.map((value) => ({
      value,
      label: t(`condition.${assetConditionSchema.parse(value)}`),
    }));

  // Who recorded each step and when, shown under the timeline.
  const recordedBy = (at: string, by: string) =>
    t('dealer.timeline.recordedBy', { date: formatIsoDate(at.slice(0, 10), locale), name: by });
  const notes: Partial<Record<WorkflowStep, string>> = {
    requested: formatIsoDate(detail.createdAt.slice(0, 10), locale),
    ...(detail.received ? { received: recordedBy(detail.received.at, detail.received.by) } : {}),
    ...(detail.inspection
      ? { inspected: recordedBy(detail.inspection.at, detail.inspection.by) }
      : {}),
    ...(detail.approved ? { approved: recordedBy(detail.approved.at, detail.approved.by) } : {}),
    ...(detail.completed
      ? { completed: recordedBy(detail.completed.at, detail.completed.by) }
      : {}),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/dealer/returns`}
        className="text-sm font-medium text-emerald-800 underline underline-offset-2 dark:text-emerald-300"
      >
        {t('dealer.detail.back')}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{assetName}</h1>
        <ReturnStatusBadge status={detail.status} t={t} />
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label={t('dealer.detail.customer')}
          value={`${detail.customer.name ?? t('dealer.customer.unknown')} (${detail.customer.id})`}
        />
        <Fact
          label={t('dealer.detail.asset')}
          value={`${detail.asset.id} · ${t(`category.${detail.asset.category}`)}`}
        />
        <Fact
          label={t('dealer.detail.expected')}
          value={
            detail.expectedReturnDate
              ? formatIsoDate(detail.expectedReturnDate, locale)
              : t('dealer.expected.none')
          }
        />
        <Fact
          label={t('dealer.detail.contractEnd')}
          value={formatIsoDate(detail.contract.endDate, locale)}
        />
      </dl>

      <section aria-labelledby="progress" className="mt-10">
        <h2 id="progress" className="mb-4 text-xl font-semibold">
          {t('dealer.timeline.title')}
        </h2>
        <WorkflowTimeline entries={returnTimeline(detail.status)} notes={notes} t={t} />
      </section>

      <section aria-labelledby="next" className="mt-10">
        <h2 id="next" className="mb-1 text-xl font-semibold">
          {detail.status === 'completed'
            ? t('dealer.status.completed')
            : t(`dealer.action.${detail.nextAction}`)}
        </h2>

        {detail.nextAction === 'receive' ? (
          <>
            <p className="mb-4 max-w-xl text-stone-700 dark:text-stone-300">
              {t('dealer.receive.help')}
            </p>
            <ActionButton
              returnId={detail.id}
              step="receive"
              label={t('dealer.action.receive')}
              texts={texts}
            />
          </>
        ) : null}

        {detail.nextAction === 'inspect' ? (
          <>
            <p className="mb-4 max-w-xl text-stone-700 dark:text-stone-300">
              {t('dealer.inspect.help')}
            </p>
            <InspectionForm
              returnId={detail.id}
              askServiceHistory={detail.asset.category === 'farm_machine'}
              conditions={conditionOptions(assetConditionSchema.options)}
              defaultCondition={detail.asset.condition}
              usageLabel={`${t('dealer.inspect.usage')} (${t(`dealer.usageUnit.${detail.asset.usage.unit}`)})`}
              defaultUsage={detail.asset.usage.value}
              labels={{
                condition: t('dealer.inspect.condition'),
                serviceHistory: t('dealer.inspect.serviceHistory'),
                serviceHistoryHelp: t('dealer.inspect.serviceHistoryHelp'),
                save: t('dealer.inspect.save'),
              }}
              texts={texts}
            />
          </>
        ) : null}

        {detail.nextAction === 'plan' && detail.inspection ? (
          <>
            <p className="mb-4 max-w-xl text-stone-700 dark:text-stone-300">
              {t('dealer.plan.help')}
            </p>
            <PlanForm
              returnId={detail.id}
              targets={conditionOptions(planOptions)}
              defaultTarget={
                suggestedTarget && planOptions.includes(suggestedTarget)
                  ? suggestedTarget
                  : defaultPlanTarget(detail.inspection.condition)
              }
              labels={{ target: t('dealer.plan.target'), create: t('dealer.plan.create') }}
              texts={texts}
            />
          </>
        ) : null}

        {detail.nextAction === 'approve' ? (
          <>
            <p className="mb-4 max-w-xl text-stone-700 dark:text-stone-300">
              {t('dealer.approve.help')}
            </p>
            <ActionButton
              returnId={detail.id}
              step="approve"
              label={t('dealer.action.approve')}
              texts={texts}
            />
          </>
        ) : null}

        {detail.nextAction === 'complete' ? (
          <>
            <p className="mb-4 max-w-xl text-stone-700 dark:text-stone-300">
              {t('dealer.complete.help')}
            </p>
            <ActionButton
              returnId={detail.id}
              step="complete"
              label={t('dealer.action.complete')}
              texts={texts}
            />
          </>
        ) : null}

        {detail.nextAction === 'none' ? (
          <p className="max-w-xl text-stone-700 dark:text-stone-300">
            {detail.status === 'completed' ? t('dealer.done.message') : t('dealer.detail.noAction')}
          </p>
        ) : null}
      </section>

      {secondLife.kind !== 'none' ? (
        <div className="mt-10">
          <SecondLifeCard
            section={secondLife}
            assetId={detail.asset.id}
            usageSinceLastService={usageSinceLastService}
            locale={locale}
            t={t}
            texts={buildReserveTexts(t)}
          />
        </div>
      ) : null}

      {detail.inspection || detail.plan ? (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {detail.inspection ? (
            <section
              aria-labelledby="inspection"
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
            >
              <h2 id="inspection" className="text-lg font-semibold">
                {t('dealer.inspect.summary')}
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Fact
                  label={t('dealer.inspect.condition')}
                  value={t(`condition.${detail.inspection.condition}`)}
                />
                <Fact
                  label={t('dealer.inspect.usage')}
                  value={t(`usage.${detail.inspection.usageUnit}`, {
                    value: formatNumber(detail.inspection.usageValue, locale),
                  })}
                />
                {detail.inspection.usageSinceLastService !== null ? (
                  <Fact
                    label={t('dealer.inspect.serviceHistory')}
                    value={formatNumber(detail.inspection.usageSinceLastService, locale)}
                  />
                ) : null}
              </dl>
            </section>
          ) : null}
          {detail.plan ? <RefurbishmentPlanCard plan={detail.plan} locale={locale} t={t} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
