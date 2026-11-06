// The rows of the leases page and the customer portal: one contract or one application, the
// item's drawing and name, the facts, and the whole row as one link (moved from page.tsx, D75).
// An application is framed with its "Cancel application" strip (`ApplicationCard`, D87).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ItemArt } from '@/components/item-art';
import { WithdrawButton } from '@/components/withdraw-button';
import { Badge } from '@/components/ui';
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { WITHDRAWABLE } from '@/domain/question-flow/withdraw';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ApplicationView } from '@/server/applications';
import type { ContractView } from '@/server/contracts';

export type RowProps = {
  asset: Asset | undefined;
  customer: string | null;
  locale: Locale;
  t: Translate;
};

/** One row: the item's drawing and name, the facts, and the whole row as one link. */
function Row({
  href,
  linkLabel,
  asset,
  badge,
  facts,
  flat = false,
}: {
  href: string;
  linkLabel: string;
  asset: Asset | undefined;
  badge: ReactNode;
  facts: string[];
  /** Inside a card that frames it (the portal's contract with its ways out): no own frame. */
  flat?: boolean;
}) {
  return (
    <article
      className={
        flat
          ? 'relative flex items-center gap-4 p-3 transition-colors hover:bg-muted/60 sm:gap-5'
          : 'relative flex items-center gap-4 rounded-xl border border-line bg-raised p-3 shadow-card transition-colors hover:border-brand sm:gap-5'
      }
    >
      <div className="hidden w-28 shrink-0 rounded-lg bg-muted px-3 pt-3 pb-1 sm:block">
        {asset ? <ItemArt category={asset.category} model={asset.model} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-lg">
            <Link
              href={href}
              className="rounded after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {asset ? `${asset.make} ${asset.model}` : '—'}
            </Link>
          </h3>
          {badge}
        </div>
        <p className="mt-1 text-sm text-ink-muted">{facts.join(' · ')}</p>
      </div>
      <span
        aria-hidden="true"
        className="hidden shrink-0 pr-2 text-sm font-bold text-brand-text sm:block"
      >
        {linkLabel} →
      </span>
    </article>
  );
}

export function ContractRow({
  contract,
  asset,
  customer,
  locale,
  t,
  flat,
}: RowProps & { contract: ContractView; flat?: boolean }) {
  const day = (iso: string) => formatIsoDate(iso, locale);
  return (
    <Row
      href={`/${locale}/contracts/${contract.id}?from=leases`}
      linkLabel={t('leases.open')}
      flat={flat}
      asset={asset}
      badge={<Badge status={contract.status}>{t(`contract.status.${contract.status}`)}</Badge>}
      facts={[
        t('leases.number', { number: contract.number }),
        t('leases.period', { start: day(contract.startDate), end: day(contract.endDate) }),
        t('leases.monthly', {
          amount: formatEuro(contract.monthlyNetCents, intlLocale[locale]),
        }),
        ...(customer ? [t('leases.customer', { name: customer })] : []),
      ]}
    />
  );
}

export function ApplicationRow({
  application,
  asset,
  customer,
  locale,
  t,
  flat,
}: RowProps & { application: ApplicationView; flat?: boolean }) {
  const ready = application.decision === 'approved';
  return (
    <Row
      href={`/${locale}/applications/${application.id}?from=leases`}
      linkLabel={ready ? t('leases.readyToSign') : t('leases.openApplication')}
      flat={flat}
      asset={asset}
      badge={
        <Badge status={application.decision}>{t(`leases.decision.${application.decision}`)}</Badge>
      }
      facts={[
        t('leases.applied', { date: formatIsoDate(application.decidedOn, locale) }),
        ...(customer ? [t('leases.customer', { name: customer })] : []),
      ]}
    />
  );
}

/**
 * An application not signed yet, framed as one card: the row on top and, while it can still be
 * withdrawn (D87), a strip under it with "Cancel application". The leases page and the portal
 * both list applications this way, so the button sits with the application it cancels.
 */
export function ApplicationCard(props: RowProps & { application: ApplicationView }) {
  const withdrawable = WITHDRAWABLE.includes(props.application.decision);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-raised shadow-card">
      <ApplicationRow {...props} flat />
      {withdrawable ? (
        <div className="rule-dashed border-t-2 bg-muted/60 px-4 py-3">
          <WithdrawButton applicationId={props.application.id} locale={props.locale} />
        </div>
      ) : null}
    </div>
  );
}
