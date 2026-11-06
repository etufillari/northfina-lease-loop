// The landing page, in three parts: the headline with the kinds of item linking into the
// catalogue, why it's greener (the CO2 that items leased again have saved), and how it works
// (the four steps and the end of the term). The catalogue itself is its own page (/catalogue).
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { HomeHero } from '@/components/home-hero';
import { HowItWorks } from '@/components/how-it-works';
import { ImpactStrip } from '@/components/impact-strip';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { todayForRequest } from '@/server/demo-clock';

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // the CO2 counter depends on today and the database

  const t = getT(locale);
  const today = await todayForRequest();

  return (
    <>
      <HomeHero locale={locale} t={t} />
      <div className="rule-dashed border-y-2 bg-raised">
        <ImpactStrip today={today} locale={locale} t={t} />
      </div>
      <HowItWorks t={t} />
    </>
  );
}
