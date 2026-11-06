import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { productPhotos, type ProductPhoto } from '@/data/product-photos';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

export default async function PhotoCreditsPage({ params }: PageProps<'/[locale]/photo-credits'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const photos: [string, ProductPhoto][] = Object.entries(productPhotos);
  return (
    <div className="bg-parchment px-card py-section-compact text-ink tablet:py-section">
      <div className="mx-auto max-w-content">
        <Link href={`/${locale}`} className="inline-flex min-h-target items-center text-primary">
          ← {t('product.back')}
        </Link>
        <h1 className="mt-4 font-display text-display-sm font-semibold tablet:text-display-lg">
          {t('photo.title')}
        </h1>
        <p className="mt-4 max-w-copy text-body text-ink-muted">{t('photo.intro')}</p>
        <ul className="mt-10 grid gap-card grid:grid-cols-2 desktop:grid-cols-3">
          {photos.map(([key, photo]) => (
            <li
              key={key}
              id={`photo-${key}`}
              className="scroll-mt-32 rounded-lg border border-hairline bg-canvas p-card"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-parchment">
                <Image
                  src={photo.src}
                  alt={t('photo.creditAlt', { author: photo.author })}
                  fill
                  sizes="(min-width: 1069px) 33vw, (min-width: 641px) 50vw, 100vw"
                  className="object-contain"
                />
              </div>
              <p className="mt-4 text-body font-semibold">
                {t('photo.by', { author: photo.author })}
              </p>
              {photo.title ? (
                <p className="mt-1 text-caption text-ink-muted">{photo.title}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-caption">
                <a
                  className="text-primary underline underline-offset-2"
                  href={photo.source}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('photo.source')}
                </a>
                <a
                  className="text-primary underline underline-offset-2"
                  href={photo.license}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('photo.license')}: {photo.licenseName}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
