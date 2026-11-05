// Spine step 3: the application. The wizard itself is a client component; this shell
// provides the persona and the as-of date.
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ApplicationWizard } from '@/components/application-wizard';
import { PERSONA_COOKIE } from '@/components/persona-cookie';
import { isLocale } from '@/i18n/locales';
import { todayIso } from '@/server/today';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ApplyPage({
  params,
  searchParams,
}: PageProps<'/[locale]/apply/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const search = await searchParams;
  const asOf = typeof search.asOf === 'string' && ISO_DATE.test(search.asOf) ? search.asOf : null;
  const persona = (await cookies()).get(PERSONA_COOKIE)?.value ?? null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <ApplicationWizard
        locale={locale}
        applicationId={id}
        personaId={persona}
        asOf={asOf}
        today={todayIso()}
      />
    </div>
  );
}
