// On the refurbishment workbench: hold the item for one of the customers who asked for it while
// it wasn't free (src/domain/holds.ts), and see whether the new price and condition fit what each
// of them asked for. "No one" puts it back for anyone.
import type { AssetCondition } from '@/data/schemas';
import { holdFits } from '@/domain/holds';
import type { Translate } from '@/i18n/get-t';

export type HoldOption = {
  id: string;
  customerName: string;
  termMonths: number;
  maxMonthlyCents: number;
  minCondition: AssetCondition;
};

type HoldForPickerProps = {
  options: readonly HoldOption[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** The item after refurbishment, and its monthly rent incl. VAT at a term (null: can't quote). */
  conditionAfter: AssetCondition;
  monthlyGrossFor: (termMonths: number) => number | null;
  euro: (cents: number) => string;
  t: Translate;
};

export function HoldForPicker(props: HoldForPickerProps) {
  const { options, selected, onSelect, t } = props;
  return (
    <fieldset className="mt-4">
      <legend className="font-medium">{t('secondLife.holdFor')}</legend>
      <p className="text-sm text-stone-700 dark:text-stone-300">{t('secondLife.holdForIntro')}</p>
      <div className="mt-2 space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="hold-for"
            checked={selected === null}
            onChange={() => onSelect(null)}
            className="mt-1 accent-emerald-700"
          />
          {t('secondLife.holdNobody')}
        </label>
        {options.map((option) => {
          const rent = props.monthlyGrossFor(option.termMonths);
          const fit = holdFits(option, {
            condition: props.conditionAfter,
            monthlyGrossCents: rent,
          });
          const why = [
            ...(fit.condition ? [] : [t('secondLife.holdNoFitCondition')]),
            ...(fit.budget
              ? []
              : [
                  rent === null
                    ? t('secondLife.holdNoFitTerm')
                    : t('secondLife.holdNoFitBudget', { rent: props.euro(rent) }),
                ]),
          ];
          return (
            <label key={option.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="hold-for"
                checked={selected === option.id}
                onChange={() => onSelect(option.id)}
                className="mt-1 accent-emerald-700"
              />
              <span>
                {t('secondLife.holdOption', {
                  name: option.customerName,
                  months: option.termMonths,
                  budget: props.euro(option.maxMonthlyCents),
                  condition: t(`condition.${option.minCondition}`),
                })}
                <span
                  className={`block font-medium ${fit.fits ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-900 dark:text-amber-200'}`}
                >
                  {fit.fits
                    ? t('secondLife.holdFits')
                    : t('secondLife.holdNoFit', { why: why.join('; ') })}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
