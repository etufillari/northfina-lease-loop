// The home page: a welcome, and the two ways in, one item from the catalogue or several at
// once for a company (a fleet). Old catalogue links (/en?category=…) still work: they are sent
// on to /en/catalogue with their filters.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { catalogueSearchString, parseCatalogueQuery } from '@/domain/catalogue';
import { MAX_FLEET_ITEMS, MIN_FLEET_ITEMS } from '@/domain/fleet';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { assetsOn } from '@/server/asset-state';
import { db } from '@/server/db';

export default async function HomePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const search = catalogueSearchString(parseCatalogueQuery(await searchParams));
  if (search) redirect(`/${locale}/catalogue${search}`);

  // Render on every request: the count depends on the app's date and the database.
  await connection();
  const t = getT(locale);
  const { today } = await appDate();
  const available = (await assetsOn(db, today)).filter(
    (item) => item.asset.status === 'available'
  ).length;

  const steps = [t('home.step1'), t('home.step2'), t('home.step3'), t('home.step4')];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{t('home.title')}</h1>
        <p className="mt-4 text-lg text-stone-700 sm:text-xl dark:text-stone-300">
          {t('home.intro')}
        </p>
        <p className="mt-5 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
          <time dateTime={today}>
            {t('home.available', { count: available, date: formatIsoDate(today, locale) })}
          </time>
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Choice
          headingId="home-catalogue"
          title={t('home.catalogueTitle')}
          text={t('home.catalogueText')}
          href={`/${locale}/catalogue`}
          action={t('home.catalogueButton')}
          primary
        />
        <Choice
          headingId="home-fleet"
          title={t('home.fleetTitle')}
          text={t('home.fleetText', { min: MIN_FLEET_ITEMS, max: MAX_FLEET_ITEMS })}
          href={`/${locale}/fleet`}
          action={t('home.fleetButton')}
        />
      </div>

      <section aria-labelledby="home-steps" className="mt-14">
        <h2 id="home-steps" className="text-xl font-semibold">
          {t('home.stepsTitle')}
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step}
              className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
            >
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white"
              >
                {index + 1}
              </span>
              <p className="mt-3 text-stone-700 dark:text-stone-300">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

type ChoiceProps = {
  headingId: string;
  title: string;
  text: string;
  href: string;
  action: string;
  primary?: boolean;
};

/** One way in: a card with a heading, a sentence and a big link. */
function Choice({ headingId, title, text, href, action, primary = false }: ChoiceProps) {
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id={headingId} className="text-2xl font-semibold">
        {title}
      </h2>
      <p className="mt-3 flex-1 text-stone-700 dark:text-stone-300">{text}</p>
      <Link
        href={href}
        className={`mt-6 inline-block self-start rounded-lg px-5 py-3 font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-900 ${
          primary
            ? 'bg-emerald-700 text-white hover:bg-emerald-800'
            : 'bg-white text-emerald-800 ring-1 ring-emerald-700/50 ring-inset hover:bg-emerald-50 dark:bg-stone-900 dark:text-emerald-300 dark:ring-emerald-400/50 dark:hover:bg-emerald-950'
        }`}
      >
        {action}
      </Link>
    </section>
  );
}
