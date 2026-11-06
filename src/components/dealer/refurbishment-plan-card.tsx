// The saved refurbishment plan: the work, what each piece costs, the total, and the result.
import { describeRefurbishmentAction } from '@/domain/return-workflow';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ReturnPlan } from '@/server/return-queries';

type Props = { plan: ReturnPlan; locale: Locale; t: Translate };

const WORK_IDS = [
  'safety_inspection',
  'battery_replacement',
  'certified_data_wipe',
  'major_service',
] as const;
type WorkId = (typeof WORK_IDS)[number];
const isWorkId = (id: string): id is WorkId => (WORK_IDS as readonly string[]).includes(id);

const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
type Condition = (typeof CONDITIONS)[number];
const isCondition = (value: string): value is Condition =>
  (CONDITIONS as readonly string[]).includes(value);

export function RefurbishmentPlanCard({ plan, locale, t }: Props) {
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const condition = (value: string) => (isCondition(value) ? t(`condition.${value}`) : value);

  function actionName(id: string): string {
    const label = describeRefurbishmentAction(id);
    if (label.kind === 'condition_upgrade') {
      return t('dealer.plan.action.condition_upgrade', {
        from: condition(label.from),
        to: condition(label.to),
      });
    }
    return isWorkId(label.id)
      ? t(`dealer.plan.action.${label.id}`)
      : t('dealer.plan.action.other', { id: label.id });
  }

  return (
    <section
      aria-labelledby="plan-title"
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="plan-title" className="text-lg font-semibold">
        {t('dealer.plan.result.title')}
      </h2>

      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-stone-600 dark:text-stone-400">
          <tr>
            <th scope="col" className="py-2 font-medium">
              {t('dealer.plan.result.work')}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {t('dealer.plan.result.cost')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
          {plan.actions.map((action) => (
            <tr key={action.id}>
              <th scope="row" className="py-2 font-normal">
                {actionName(action.id)}
                {action.quantity > 1 ? (
                  <span className="ml-2 text-stone-600 dark:text-stone-400">
                    {t('dealer.plan.result.quantity', { count: action.quantity })}
                  </span>
                ) : null}
              </th>
              <td className="py-2 text-right tabular-nums">{money(action.costCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-stone-300 font-semibold dark:border-stone-700">
            <th scope="row" className="py-2">
              {t('dealer.plan.result.total')}
            </th>
            <td className="py-2 text-right tabular-nums">{money(plan.totalCostCents)}</td>
          </tr>
        </tfoot>
      </table>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-stone-600 dark:text-stone-400">
            {t('dealer.plan.result.condition')}
          </dt>
          <dd className="font-medium">{condition(plan.resultingCondition)}</dd>
        </div>
        <div>
          <dt className="text-stone-600 dark:text-stone-400">{t('dealer.plan.result.usage')}</dt>
          <dd className="font-medium">
            {t(`usage.${plan.inspectedUsage.unit}`, {
              value: formatNumber(plan.resultingUsage, locale),
            })}
          </dd>
        </div>
      </dl>
      {plan.usageReset ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          {t('dealer.plan.result.usageReset')}
        </p>
      ) : null}
    </section>
  );
}
