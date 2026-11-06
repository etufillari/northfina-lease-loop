import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { DemoSelection } from './api';
import { Field, inputClass, panelClass } from './ui';

export function DemoControls({
  selection,
  onChange,
  locale,
  busy,
  businessDate,
  customerId,
  customers = [],
}: {
  selection: DemoSelection;
  onChange: (next: DemoSelection) => void;
  locale: Locale;
  busy: boolean;
  businessDate?: string;
  customerId?: string;
  customers?: readonly { id: string; name: string }[];
}) {
  const t = getT(locale);
  const role = selection.role ?? 'customer';
  return (
    <aside className={panelClass + ' demo-panel'} aria-label={t('spine.demo')}>
      <p className="font-medium">{t('spine.demo')}</p>
      <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field id="demo-role" label={t('spine.demoRole')}>
          <select
            id="demo-role"
            className={inputClass}
            value={role}
            onChange={(event) =>
              onChange({
                ...selection,
                role: event.target.value === 'operator' ? 'operator' : 'customer',
              })
            }
          >
            <option value="customer">{t('spine.customerMode')}</option>
            <option value="operator">{t('spine.dealerMode')}</option>
          </select>
        </Field>
        {role === 'customer' ? (
          <Field id="demo-customer" label={t('spine.customer')}>
            <select
              id="demo-customer"
              className={inputClass}
              value={selection.customerId || customerId || ''}
              onChange={(event) => onChange({ ...selection, customerId: event.target.value })}
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field id="demo-date" label={t('spine.date')}>
          <input
            id="demo-date"
            type="date"
            className={inputClass}
            value={selection.businessDate || businessDate || ''}
            onChange={(event) => onChange({ ...selection, businessDate: event.target.value })}
          />
        </Field>
      </fieldset>
      <p className="mt-3 text-sm">{t('spine.dateHelp')}</p>
      {role === 'operator' ? <p className="mt-3 text-sm">{t('spine.dealerHelp')}</p> : null}
    </aside>
  );
}
