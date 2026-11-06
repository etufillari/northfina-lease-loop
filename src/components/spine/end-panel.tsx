import type { AssetCondition } from '@/data/schemas';
import { endLeaseReadiness, type EndChoice } from '@/domain/lifecycle';
import type { ContractView } from '@/server/spine-views';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { Bootstrap } from './price-panel';
import { ConsentAction } from './consent-action';
import { endConsentKey } from './consent-context';
import { endDraftSchema } from './end-draft';
import { wholeInput } from './form-values';
import { useDraft } from './use-draft';
import { buttonClass, Field, inputClass, messageFor, panelClass } from './ui';

export type EndForm = {
  choice: EndChoice;
  condition: AssetCondition;
  usageValue: number;
  nextCustomerId?: string;
};

export function EndPanel({
  contract,
  data,
  locale,
  busy,
  onDate,
  onEnd,
}: {
  contract: ContractView;
  data: Bootstrap;
  locale: Locale;
  busy: boolean;
  onDate: (date: string) => void;
  onEnd: (input: EndForm) => void;
}) {
  const t = getT(locale);
  const [draft, saveDraft, volatile] = useDraft(
    `lease-loop:end:${data.customer.id}:${contract.id}`,
    {
      choice: 'return' as EndChoice,
      condition: data.asset.condition,
      usageText: String(data.asset.usage.value),
      successorId: '',
    },
    endDraftSchema
  );
  const { choice, condition, usageText, successorId } = draft;
  const inspectionRequired = choice !== 'buy';
  const usageValue = inspectionRequired
    ? wholeInput(usageText, data.asset.usage.value)
    : data.asset.usage.value;
  const invalid = usageValue === null || (choice === 'pass_on' && !successorId);
  const rentalInvoiceCount = contract.invoices.filter((invoice) => invoice.kind === 'rent').length;
  const latestInvoiceDate = contract.invoices.reduce<string | undefined>(
    (latest, invoice) => (!latest || invoice.invoiceDate > latest ? invoice.invoiceDate : latest),
    undefined
  );
  const readiness = endLeaseReadiness({
    status: contract.status,
    endDate: contract.endDate,
    onDate: data.businessDate,
    termMonths: contract.terms.termMonths,
    rentalInvoiceCount,
    latestInvoiceDate,
  });
  const dateToAdvance =
    latestInvoiceDate && latestInvoiceDate > contract.endDate
      ? latestInvoiceDate
      : contract.endDate;
  if (contract.status !== 'active') return <p className={panelClass}>{t('spine.closed')}</p>;
  return (
    <section className={panelClass} aria-labelledby="end-heading">
      <h2 id="end-heading" className="text-xl font-semibold">
        {readiness.ok ? t('spine.end') : t('spine.endProgressTitle')}
      </h2>
      <p className="mt-3">{t('spine.endHelp')}</p>
      {volatile ? (
        <p role="status" className="mt-3">
          {t('spine.storageWarning')}
        </p>
      ) : null}
      {!readiness.ok ? (
        <div className="mt-4 space-y-3 text-sm">
          {readiness.reason === 'too_early' ? (
            <>
              <p role="status">
                {t('spine.endNotReadyDate', { date: formatIsoDate(dateToAdvance, locale) })}
              </p>
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => onDate(dateToAdvance)}
              >
                {t('spine.advanceEndDate', { date: formatIsoDate(dateToAdvance, locale) })}
              </button>
            </>
          ) : null}
          <p role={readiness.reason === 'invoices_missing' ? 'status' : undefined}>
            {t('spine.endInvoiceProgress', {
              issued: formatNumber(rentalInvoiceCount, locale),
              total: formatNumber(contract.terms.termMonths, locale),
            })}
          </p>
          <a
            href="#invoices-heading"
            className="inline-flex min-h-11 items-center rounded-md font-semibold underline underline-offset-2"
          >
            {t('spine.endInvoiceLink')}
          </a>
        </div>
      ) : null}
      {readiness.ok ? (
        <fieldset disabled={busy} className="mt-5 space-y-4">
          <legend className="sr-only">{t('spine.end')}</legend>
          <div className="flex flex-wrap gap-4">
            {(['buy', 'return', 'pass_on'] as const).map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="end-choice"
                  value={value}
                  checked={choice === value}
                  onChange={() => saveDraft({ ...draft, choice: value })}
                />
                {messageFor(locale, 'spine.' + value)}
              </label>
            ))}
          </div>
          {inspectionRequired ? (
            <>
              <Field id="return-condition" label={t('spine.condition')}>
                <select
                  id="return-condition"
                  className={inputClass}
                  value={condition}
                  onChange={(event) =>
                    saveDraft({ ...draft, condition: event.target.value as AssetCondition })
                  }
                >
                  {(['new', 'like_new', 'good', 'fair', 'poor'] as const).map((value) => (
                    <option key={value} value={value}>
                      {messageFor(locale, 'condition.' + value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="return-usage"
                label={
                  t('spine.usage') +
                  ' (' +
                  messageFor(locale, 'spine.unit.' + data.asset.usage.unit) +
                  ')'
                }
              >
                <input
                  id="return-usage"
                  className={inputClass}
                  type="number"
                  min={data.asset.usage.value}
                  max={2_147_483_647}
                  step={1}
                  value={usageText}
                  aria-invalid={usageValue === null || undefined}
                  aria-describedby={usageValue === null ? 'return-usage-error' : undefined}
                  onChange={(event) => saveDraft({ ...draft, usageText: event.target.value })}
                />
                {usageValue === null ? (
                  <p id="return-usage-error" className="mt-2 text-sm">
                    {t('spine.invalidUsage', { minimum: data.asset.usage.value })}
                  </p>
                ) : null}
              </Field>
            </>
          ) : null}
          {choice === 'pass_on' ? (
            <Field id="next-customer" label={t('spine.nextCustomer')}>
              <select
                id="next-customer"
                className={inputClass}
                value={successorId}
                onChange={(event) => saveDraft({ ...draft, successorId: event.target.value })}
              >
                <option value="">{t('spine.select')}</option>
                {data.customers
                  .filter((customer) => customer.id !== data.customer.id)
                  .map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : null}
          <ConsentAction
            key={endConsentKey({
              locale,
              contract,
              data,
              choice,
              condition: inspectionRequired ? condition : data.asset.condition,
              usageText: inspectionRequired ? usageText : String(data.asset.usage.value),
              successorId,
            })}
            label={t('spine.endConsent')}
            actionLabel={busy ? t('spine.pending') : t('spine.confirmEnd')}
            busy={busy}
            disabled={invalid}
            onConfirm={() => {
              if (!readiness.ok || usageValue === null || (choice === 'pass_on' && !successorId))
                return;
              onEnd({
                choice,
                condition: inspectionRequired ? condition : data.asset.condition,
                usageValue,
                ...(choice === 'pass_on' ? { nextCustomerId: successorId } : {}),
              });
            }}
          />
        </fieldset>
      ) : null}
    </section>
  );
}
