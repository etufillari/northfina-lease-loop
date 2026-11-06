'use client';
// During-contract actions. The early exit ALWAYS shows the full calculation first (card 8);
// confirming is a separate click. End-of-term buy/return unlock when the term is over.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BuyoutInvoicePreview } from '@/domain/buyout';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { BuyoutPurchase } from './buyout-purchase';

type ExitBreakdown = {
  usedMonths: number;
  /** The months paid for: the months used, but never fewer than the 6-month minimum. */
  chargedMonths: number;
  coveringTermMonths: number;
  fairMonthlyNetCents: number;
  fairTotalNetCents: number;
  paidNetCents: number;
  handlingFeeNetCents: number;
  exitNetCents: number;
  vatRatePercent: number;
  exitVatCents: number;
  exitTotalCents: number;
};

export function ContractActions({
  locale,
  contractId,
  personaId,
  asOf,
  endsOn,
  today,
  buyoutInvoice,
  pricesInclVat,
  purchaseAtEnd,
  termMonthsTotal,
}: {
  locale: Locale;
  contractId: string;
  personaId: string;
  asOf: string | null;
  endsOn: string;
  today: string;
  /** The buyout invoice as it would be issued; null when no VAT rate is known for it. */
  buyoutInvoice: BuyoutInvoicePreview | null;
  /** Consumers see prices with VAT, businesses net. */
  pricesInclVat: boolean;
  purchaseAtEnd: boolean;
  termMonthsTotal: number;
}) {
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const suffix = asOf ? `?asOf=${asOf}` : '';
  const [preview, setPreview] = useState<ExitBreakdown | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferToken, setTransferToken] = useState<string | null>(null);
  const [nomineeEmail, setNomineeEmail] = useState('');
  const [nominated, setNominated] = useState(false);
  const termOver = today >= endsOn;

  async function createLink() {
    setBusy(true);
    const response = await fetch(`/api/contracts/${contractId}/transfer${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor: personaId }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) setTransferToken(body.data.token);
    else window.alert(body.error?.message ?? t('common.error'));
  }

  async function nominate() {
    if (!nomineeEmail) return;
    setBusy(true);
    const response = await fetch(`/api/contracts/${contractId}/nominate${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: nomineeEmail, actor: personaId }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) setNominated(true);
    else window.alert(body.error?.message ?? t('common.error'));
  }

  async function loadPreview() {
    setBusy(true);
    const response = await fetch(`/api/contracts/${contractId}/early-exit${suffix}`);
    const body = await response.json();
    setBusy(false);
    if (body.success) setPreview(body.data.breakdown);
  }

  async function post(path: string, payload: Record<string, unknown>) {
    setBusy(true);
    const response = await fetch(`/api/contracts/${contractId}/${path}${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, actor: personaId }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) {
      setPreview(null);
      router.refresh();
    } else {
      window.alert(body.error?.message ?? t('common.error'));
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-sm font-semibold">{t('contract.actions')}</h2>

      <div className="mt-3">
        <h3 className="text-sm font-medium">
          {termOver ? t('endOfTerm.title') : t('buyout.title')}
        </h3>
        <div className="mt-2">
          <BuyoutPurchase
            locale={locale}
            contractId={contractId}
            personaId={personaId}
            suffix={suffix}
            invoice={buyoutInvoice}
            pricesInclVat={pricesInclVat}
            purchaseAtEnd={purchaseAtEnd}
            termOver={termOver}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
        {!termOver ? (
          <button
            type="button"
            onClick={loadPreview}
            disabled={busy}
            className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            {t('exit.button')}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => post('end-of-term', { action: 'return' })}
              className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:ring-stone-700 dark:hover:bg-stone-800"
            >
              {t('endOfTerm.return')}
            </button>
          </>
        )}
        {!termOver ? (
          <span className="text-xs text-stone-500">{t('endOfTerm.notYet', { date: endsOn })}</span>
        ) : null}
      </div>

      <div className="mt-5 border-t border-stone-100 pt-4 dark:border-stone-800">
        <h3 className="text-sm font-semibold">{t('passOn.title')}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {transferToken ? (
            <p className="text-sm">
              {t('passOn.linkHint')}{' '}
              <a
                href={`/${locale}/transfer/${transferToken}`}
                className="font-medium break-all text-emerald-800 underline dark:text-emerald-300"
              >
                {`${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/transfer/${transferToken}`}
              </a>
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={createLink}
              className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:ring-stone-700 dark:hover:bg-stone-800"
            >
              {t('passOn.createLink')}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={nomineeEmail}
            onChange={(event) => setNomineeEmail(event.target.value)}
            placeholder={t('passOn.nominate')}
            aria-label={t('passOn.nominate')}
            className="w-64 rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
          />
          <button
            type="button"
            disabled={busy || !nomineeEmail}
            onClick={nominate}
            className="rounded-xl px-4 py-1.5 text-sm font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            {t('passOn.nominateButton')}
          </button>
          {nominated ? (
            <span className="text-sm text-emerald-800 dark:text-emerald-300">
              {t('passOn.nominated')}
            </span>
          ) : null}
        </div>
      </div>

      {preview ? (
        <div className="mt-5 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200 ring-inset dark:bg-stone-800 dark:ring-stone-700">
          <h3 className="font-semibold">{t('exit.title')}</h3>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            {t('exit.intro', {
              used: preview.usedMonths,
              term: termMonthsTotal,
              covering: preview.coveringTermMonths,
            })}
          </p>
          {preview.chargedMonths > preview.usedMonths ? (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
              {t('exit.minimum', { months: preview.chargedMonths })}
            </p>
          ) : null}
          <dl className="mt-3 space-y-1.5 text-sm tabular-nums">
            <Row
              label={t('exit.fairRent', {
                used: preview.chargedMonths,
                covering: preview.coveringTermMonths,
                rate: euro(preview.fairMonthlyNetCents),
              })}
              value={euro(preview.fairTotalNetCents)}
            />
            <Row label={t('exit.paid')} value={`− ${euro(preview.paidNetCents)}`} />
            <Row label={t('exit.fee')} value={`+ ${euro(preview.handlingFeeNetCents)}`} />
            <Row label={t('exit.net')} value={euro(preview.exitNetCents)} bold />
            <Row
              label={`${t('price.vat')} ${preview.vatRatePercent} %`}
              value={`+ ${euro(preview.exitVatCents)}`}
            />
            <Row
              label={t('exit.total', { rate: preview.vatRatePercent })}
              value={euro(preview.exitTotalCents)}
              bold
            />
          </dl>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => post('early-exit', {})}
              className="rounded-xl bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {t('exit.confirm')}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-white dark:ring-stone-600"
            >
              {t('exit.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${bold ? 'font-semibold' : ''}`}>
      <dt className="text-stone-600 dark:text-stone-300">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
