import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { SecondLifePlan } from '@/server/relisting';

/** Card 9 for staff: refurbish or not, and who on the waiting list gets the item, with reasons. */
export function SecondLifePanel({ plan, locale }: { plan: SecondLifePlan; locale: Locale }) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { decision, match } = plan;
  const winner = match?.winner;
  return (
    <section
      aria-labelledby="second-life-title"
      className="mt-8 rounded-lg border border-hairline p-6"
    >
      <p className="text-caption font-semibold text-primary">{t('secondLife.label')}</p>
      <h2 id="second-life-title" className="mt-2 text-tagline font-semibold">
        {t('secondLife.title')}
      </h2>
      <p className="mt-3 text-body">
        {t(`secondLife.refurbish.${decision.reason}`, {
          price: euro(decision.priceNetCents),
          cost: euro(decision.refurbishmentCostCents),
          net: euro(decision.netResultCents),
        })}
      </p>
      {match ? (
        <>
          <div className="mt-5 rounded-md bg-parchment p-4" role="status">
            {winner ? (
              <>
                <p className="font-semibold">
                  {t('secondLife.winner', {
                    id: winner.request.id,
                    who: winner.request.who,
                    months: t('product.months', { count: winner.request.preferred_term_months }),
                    rent: euro(winner.monthlyNetCents ?? 0),
                  })}
                </p>
                <p className="mt-1 text-caption">
                  {t(`secondLife.decidedBy.${match.decidedBy ?? 'only_match'}`, {
                    date: formatIsoDate(winner.request.needed_by, locale),
                  })}
                </p>
              </>
            ) : (
              <p className="font-semibold">{t('secondLife.noMatch')}</p>
            )}
          </div>
          <p className="mt-5 text-caption text-ink-muted">
            {t('secondLife.listIntro', {
              condition: t(`condition.${plan.condition}`).toLowerCase(),
              price: euro(decision.priceNetCents),
            })}
          </p>
          <ol className="mt-2 divide-y divide-divider">
            {match.candidates.map((candidate) => (
              <li key={candidate.request.id} className="py-3 text-caption">
                <div className="flex flex-wrap justify-between gap-3">
                  <p className="font-semibold">
                    {candidate.request.id} · {candidate.request.who}
                  </p>
                  <p
                    className={
                      candidate.failed.length ? 'text-ink-muted' : 'font-semibold text-primary'
                    }
                  >
                    {candidate.failed.length
                      ? candidate.failed
                          .map((check) => t(`secondLife.failed.${check}` as MessageKey))
                          .join(' · ')
                      : t('secondLife.fits')}
                  </p>
                </div>
                <p className="mt-1 text-fine text-ink-muted">
                  {t('secondLife.terms', {
                    signup: candidate.signupOrder,
                    months: t('product.months', { count: candidate.request.preferred_term_months }),
                    budget: euro(candidate.request.max_monthly_net_rent_cents),
                    rent:
                      candidate.monthlyNetCents === null ? '–' : euro(candidate.monthlyNetCents),
                    condition: t(`condition.${candidate.request.min_condition}`).toLowerCase(),
                    date: formatIsoDate(candidate.request.needed_by, locale),
                  })}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-fine text-ink-muted">{t('secondLife.rule')}</p>
        </>
      ) : null}
    </section>
  );
}
