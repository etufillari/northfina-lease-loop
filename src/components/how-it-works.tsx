// "How it works": on the left, the lease in four steps; on the right, what happens when the
// term ends (buy, return or pass on) and what "the price is locked" means when VAT changes.
// Both are rules the app actually follows (D2, D16).
import type { Translate } from '@/i18n/get-t';

const STEPS = [1, 2, 3, 4] as const;
const CHOICES = ['buy', 'return', 'passOn'] as const;

export function HowItWorks({ t }: { t: Translate }) {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-6 bg-muted">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="how-title" className="text-center text-4xl sm:text-5xl">
          {t('home.cta.how')}
        </h2>
        <div className="mt-10 grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="rounded-xl bg-raised p-6 shadow-panel sm:p-8">
            <h3 className="text-sm font-extrabold tracking-[0.14em] text-ink-muted uppercase">
              {t('home.steps.title')}
            </h3>
            <ol className="mt-5">
              {STEPS.map((n) => (
                <li key={n} className="relative flex gap-4 pb-6 last:pb-0">
                  {n < STEPS.length ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-11 bottom-1 left-[1.3rem] border-l-2 border-dotted border-line-strong"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-brand font-heading text-xl font-semibold text-brand-contrast"
                  >
                    {n}
                  </span>
                  <span>
                    <span className="block font-heading text-xl font-semibold">
                      {t(`home.steps.${n}.title`)}
                    </span>
                    <span className="block text-ink-muted">{t(`home.steps.${n}.body`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="text-3xl">{t('how.title')}</h3>
            <p className="mt-3 text-lg text-ink-muted">{t('how.intro')}</p>
            <ul className="mt-6 space-y-5">
              {CHOICES.map((choice) => (
                <li key={choice}>
                  <span className="block font-heading text-xl font-semibold">
                    {t(`how.${choice}.title`)}
                  </span>
                  <span className="block text-ink-muted">{t(`how.${choice}.body`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-lg border-2 border-dashed border-line-strong p-5">
              <p className="font-heading text-lg font-semibold">{t('how.vat.title')}</p>
              <p className="mt-1 text-ink-muted">{t('how.vat.body')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
