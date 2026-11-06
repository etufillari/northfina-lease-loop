// The About page: details who built Lease Loop, the Northfina × Hive Helsinki hackathon context,
// and the engineering principles behind the circular-economy leasing platform.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/about'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return {
    title: `${t('about.title')} – ${t('brand.name')}`,
    description: t('about.subtitle'),
  };
}

const teamMembers = [
  { key: 'about.member2' as const, role: 'Hive Helsinki' },
  { key: 'about.member3' as const, role: 'Hive Helsinki' },
  { key: 'about.member4' as const, role: 'Hive Helsinki' },
];

export default async function AboutPage({ params }: PageProps<'/[locale]/about'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Back link */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          <span aria-hidden="true">&larr;</span> {t('about.backToCatalogue')}
        </Link>
      </nav>

      {/* Hero header */}
      <header className="mb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          Northfina × Hive Helsinki Hackathon 2026
        </div>
        <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
          {t('about.title')}
        </h1>
        <p className="mt-3 text-lg text-stone-600 sm:text-xl dark:text-stone-300">
          {t('about.subtitle')}
        </p>
      </header>

      <div className="space-y-8">
        {/* Purpose & Event */}
        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="font-heading text-xl font-bold text-stone-900 dark:text-stone-100">
            {t('about.purposeTitle')}
          </h2>
          <p className="mt-3 leading-relaxed text-stone-600 dark:text-stone-300">
            {t('about.purposeDescription')}
          </p>
        </section>

        {/* What We Built */}
        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="font-heading text-xl font-bold text-stone-900 dark:text-stone-100">
            {t('about.projectTitle')}
          </h2>
          <p className="mt-3 leading-relaxed text-stone-600 dark:text-stone-300">
            {t('about.projectDescription')}
          </p>
        </section>

        {/* Team Patsastus */}
        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="font-heading text-xl font-bold text-stone-900 dark:text-stone-100">
            {t('about.teamTitle')}
          </h2>
          <p className="mt-2 text-stone-600 dark:text-stone-300">{t('about.teamDescription')}</p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {teamMembers.map((member) => (
              <div
                key={member.key}
                className="flex items-center gap-3.5 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700/60 dark:bg-stone-800/60"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 font-heading font-bold text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                  {t(member.key).charAt(0)}
                </div>
                <div>
                  <div className="font-medium text-stone-900 dark:text-stone-100">
                    {t(member.key)}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">{member.role}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Engineering Principles */}
        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="font-heading text-xl font-bold text-stone-900 dark:text-stone-100">
            {t('about.techTitle')}
          </h2>
          <ul className="mt-4 space-y-3 text-stone-600 dark:text-stone-300">
            <li className="flex items-start gap-3">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckIcon />
              </span>
              <span>{t('about.techRule1')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckIcon />
              </span>
              <span>{t('about.techRule2')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckIcon />
              </span>
              <span>{t('about.techRule3')}</span>
            </li>
          </ul>
        </section>

        {/* Call to action */}
        <div className="pt-2">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            {t('about.backToCatalogue')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5 fill-current">
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
