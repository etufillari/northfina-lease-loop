import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type Step = 'questions' | 'review' | 'result';

type ApplicationProgressProps = {
  step: Step;
  locale: Locale;
};

const steps: { id: Step; labelKey: string }[] = [
  { id: 'questions', labelKey: 'application.progress.questions' },
  { id: 'review', labelKey: 'application.progress.review' },
  { id: 'result', labelKey: 'application.progress.result' },
];

export default function ApplicationProgress({ step, locale }: ApplicationProgressProps) {
  const t = getT(locale);
  const currentIndex = steps.findIndex((item) => item.id === step);

  return (
    <nav aria-label={t('application.progress.label')}>
      <ol className="flex items-center">
        {steps.map((item, index) => {
          const completed = index < currentIndex;
          const current = item.id === step;

          return (
            <li
              key={item.id}
              className="flex min-w-0 flex-1 items-center last:flex-none"
              aria-current={current ? 'step' : undefined}
            >
              <div className="flex flex-col items-center gap-2">
                <span
                  className={[
                    'flex size-8 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                    completed
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : current
                        ? 'border-emerald-600 bg-emerald-950 text-emerald-300'
                        : 'border-stone-700 bg-stone-900 text-stone-400',
                  ].join(' ')}
                >
                  {completed ? (
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
                      <path
                        d="m5 10 3.2 3.2L15 6.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>

                <span
                  className={[
                    'whitespace-nowrap text-xs font-medium sm:text-sm',
                    current ? 'text-stone-100' : completed ? 'text-emerald-400' : 'text-stone-400',
                  ].join(' ')}
                >
                  {t(item.labelKey as Parameters<typeof t>[0])}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div
                  aria-hidden="true"
                  className={[
                    'mx-2 mb-6 h-px min-w-4 flex-1 sm:mx-4',
                    completed ? 'bg-emerald-600' : 'bg-stone-700',
                  ].join(' ')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
