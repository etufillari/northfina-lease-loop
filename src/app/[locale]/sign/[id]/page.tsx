// The page a company's signatory opens from the e-mailed link (scenario card 6). No account is
// needed: the link's token proves it was issued for this contract.
import { notFound } from 'next/navigation';
import { SignContractForm } from '@/components/sign-contract-form';
import { formatEuro } from '@/domain/money';
import { AWAITING_SIGNATURE } from '@/domain/signatory';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { contractForSigning } from '@/server/contract-signing';
import { db } from '@/server/db';

export default async function Page({ params, searchParams }: PageProps<'/[locale]/sign/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const { token } = await searchParams;
  const t = getT(locale);
  const contract = await contractForSigning(db, id, token);
  if (!contract || typeof token !== 'string')
    return (
      <div className="mx-auto max-w-copy px-card py-section-compact">
        <h1 className="font-display text-display-sm font-semibold">{t('signing.pageTitle')}</h1>
        <p className="mt-6 text-body">{t('signing.invalid')}</p>
      </div>
    );
  const company = contract.customer.owner.name;
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const rows: [string, string][] = [
    [t('signing.item'), `${contract.asset.make} ${contract.asset.model}`],
    [t('signing.term'), t('product.months', { count: contract.termMonths })],
    [t('signing.monthly'), euro(contract.monthlyNetCents)],
    [t('signing.downPayment'), euro(contract.downPaymentCents)],
    [t('signing.buyout'), euro(contract.buyoutCents)],
  ];
  return (
    <div className="mx-auto max-w-copy px-card py-section-compact">
      <h1 className="font-display text-display-sm font-semibold tablet:text-display-lg">
        {t('signing.pageTitle')}
      </h1>
      <p className="mt-6 max-w-prose text-body">{t('signing.intro', { company })}</p>
      <dl className="mt-8 divide-y divide-hairline rounded-lg bg-parchment px-card">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-4">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {contract.status === AWAITING_SIGNATURE ? (
        <>
          <p className="mt-6 text-caption text-ink-muted">{t('signing.startsOn')}</p>
          <SignContractForm
            contractId={contract.id}
            token={token}
            labels={{
              confirm: t('signing.confirm', { company }),
              sign: t('signing.sign'),
              error: t('signing.error'),
            }}
          />
        </>
      ) : (
        <p role="status" className="mt-8 text-body font-semibold">
          {t('signing.signed', {
            date: formatIsoDate(contract.signedOn ?? contract.startDate, locale),
          })}
        </p>
      )}
    </div>
  );
}
