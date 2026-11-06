// Spine step 3: the application. The wizard itself is a client component; this shell
// provides the persona and the as-of date (the time-travel control or ?asOf=), and a link
// back to what is being applied for: the item, or the fleet page for a group of items.
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ApplicationWizard } from '@/components/application-wizard';
import { BackLink } from '@/components/back-to-catalogue';
import { customerPersona, PERSONA_COOKIE } from '@/components/persona-cookie';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';
import { quoteAssetIds } from '@/server/quotes';

export default async function ApplyPage({
  params,
  searchParams,
}: PageProps<'/[locale]/apply/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  const persona = customerPersona((await cookies()).get(PERSONA_COOKIE)?.value);

  const application = await db.application.findUnique({
    where: { id },
    include: { quote: true },
  });
  const assetIds = application ? quoteAssetIds(application.quote) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {assetIds.length === 1 ? (
        <BackLink
          path={`/${locale}/assets/${assetIds[0]}`}
          label={t('apply.backToItem')}
          asOfParam={asOfParam}
        />
      ) : assetIds.length > 1 ? (
        <BackLink path={`/${locale}/fleet`} label={t('apply.backToFleet')} asOfParam={asOfParam} />
      ) : null}
      <div className={assetIds.length > 0 ? 'mt-3' : undefined}>
        <ApplicationWizard
          locale={locale}
          applicationId={id}
          personaId={persona}
          asOf={asOf}
          today={asOf}
        />
      </div>
    </div>
  );
}
