// A fleet: several DISTINCT physical items of one category, leased as one contract banded
// on the total (Kettu Koodi's six laptops). Selection is client-side; pricing reuses the
// same configurator as a single asset.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { FleetBuilder } from '@/components/fleet-builder';
import { PERSONA_COOKIE } from '@/components/persona-cookie';
import { loadPriceLists } from '@/data/load';
import { listPriceOn } from '@/domain/price-list';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';

export default async function FleetPage({ params, searchParams }: PageProps<'/[locale]/fleet'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { asOf } = await asOfFromPage(await searchParams);
  const persona = (await cookies()).get(PERSONA_COOKIE)?.value ?? null;
  const [assets, priceLists] = await Promise.all([listAssets(db), loadPriceLists()]);

  const leasable = assets
    .filter((asset) => asset.status === 'available' || asset.status === 'returned')
    .map((asset) => {
      const price = listPriceOn(priceLists, asset.id, asOf);
      return {
        id: asset.id,
        category: asset.category,
        make: asset.make,
        model: asset.model,
        condition: asset.condition,
        priceCents: price.ok ? price.priceCents : null,
      };
    })
    .filter((asset) => asset.priceCents !== null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href={`/${locale}`}
        className="text-sm text-emerald-800 hover:underline dark:text-emerald-300"
      >
        ← {t('asset.backToCatalogue')}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t('fleet.title')}</h1>
      <p className="mt-2 text-stone-700 dark:text-stone-300">{t('fleet.intro')}</p>

      <FleetBuilder locale={locale} assets={leasable} personaId={persona} asOf={asOf} />
    </div>
  );
}
