// Spine step 3: the application. The wizard itself is a client component; this shell
// provides the persona and the as-of date (the time-travel control or ?asOf=).
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ApplicationWizard } from '@/components/application-wizard';
import { PERSONA_COOKIE } from '@/components/persona-cookie';
import { isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';

export default async function ApplyPage({
  params,
  searchParams,
}: PageProps<'/[locale]/apply/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const { asOf } = await asOfFromPage(await searchParams);
  const persona = (await cookies()).get(PERSONA_COOKIE)?.value ?? null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <ApplicationWizard
        locale={locale}
        applicationId={id}
        personaId={persona}
        asOf={asOf}
        today={asOf}
      />
    </div>
  );
}
