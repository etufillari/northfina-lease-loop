// The take-over page a transfer link opens: the lease as the recipient would inherit it —
// same locked rent, remaining schedule, no down payment — and the apply button.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { customerPersona, PERSONA_COOKIE } from '@/components/persona-cookie';
import { TransferApply } from '@/components/transfer-apply';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';
import { termEndsOn } from '@/server/lifecycle';
import { getTransferOffer } from '@/server/transfers';

export default async function TransferPage({
  params,
  searchParams,
}: PageProps<'/[locale]/transfer/[token]'>) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { asOf } = await asOfFromPage(await searchParams);
  const persona = customerPersona((await cookies()).get(PERSONA_COOKIE)?.value);
  const offer = await getTransferOffer(db, token);

  if (!offer) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t('transfer.title')}</h1>
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('transfer.invalid')}
        </p>
      </div>
    );
  }

  const { contract } = offer;
  const paidMonths = contract.invoices.filter(
    (i) => i.type === 'lease' && i.due_date <= asOf
  ).length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('transfer.title')}</h1>
      <p className="mt-3 text-stone-700 dark:text-stone-300">
        {t('transfer.intro', {
          rent: euro(contract.monthly_net_rent_cents),
          months: contract.term_months - paidMonths,
        })}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-stone-200 bg-white p-5 text-sm dark:border-stone-800 dark:bg-stone-900">
        <Fact
          label={t('asset.listPrice')}
          value={offer.assets.map((a) => `${a.make} ${a.model}`).join(', ')}
        />
        <Fact label={t('price.netRent')} value={euro(contract.monthly_net_rent_cents)} />
        <Fact
          label={t('contract.term')}
          value={t('price.months', { months: contract.term_months })}
        />
        <Fact label={t('contract.endsOn')} value={formatIsoDate(termEndsOn(contract), locale)} />
      </dl>

      <div className="mt-6">
        <TransferApply locale={locale} token={token} personaId={persona} asOf={asOf} />
      </div>
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
