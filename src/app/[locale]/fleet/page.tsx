// A fleet: several DISTINCT physical items of one category, leased as one contract banded
// on the total (Kettu Koodi's six laptops). Selection is client-side; pricing reuses the
// same configurator as a single asset.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { FleetBuilder } from '@/components/fleet-builder';
import { customerPersona, PERSONA_COOKIE } from '@/components/persona-cookie';
import { loadPriceLists } from '@/data/load';
import { listPriceOn } from '@/domain/price-list';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { listAssets } from '@/server/assets';
import { assetImageUrls } from '@/server/asset-images';
import { db } from '@/server/db';
import { secondLifePrices } from '@/server/quotes';

export default async function FleetPage({ params, searchParams }: PageProps<'/[locale]/fleet'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { asOf } = await asOfFromPage(await searchParams);
  const persona = customerPersona((await cookies()).get(PERSONA_COOKIE)?.value);
  const [assets, priceLists, secondLife, imageRows] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    secondLifePrices(db),
    db.asset.findMany({ select: { id: true, image_path: true } }),
  ]);
  const images = assetImageUrls(imageRows);

  // A `returned` item is still in maintenance (the second-life desk has not cleared it).
  const leasable = assets
    .filter((asset) => asset.status === 'available')
    .map((asset) => {
      const price = listPriceOn(priceLists, asset.id, asOf);
      return {
        id: asset.id,
        category: asset.category,
        make: asset.make,
        model: asset.model,
        condition: asset.condition,
        modelYear: asset.model_year,
        usageUnit: asset.usage.unit,
        usageValue: asset.usage.total ?? asset.usage.value,
        previousLives: asset.previous_lives,
        imageUrl: images[asset.id] ?? null,
        // A refurbished item is priced at the desk's re-price, not the new-item price list.
        priceCents: price.ok ? (secondLife[asset.id] ?? price.priceCents) : null,
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
