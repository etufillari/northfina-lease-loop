import Image from 'next/image';
import Link from 'next/link';
import { photoForAsset } from '@/data/product-photos';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type ProductPhotoProps = {
  assetId: string;
  productName: string;
  locale: Locale;
  sizes?: string;
  variant?: 'default' | 'catalogue';
  showCaption?: boolean;
  /** From tablet width, grow to the height of the column beside it instead of staying square. */
  fillHeight?: boolean;
};

/** Photos illustrate the fictional model, not the physical item or its condition. */
export function ProductPhoto({
  assetId,
  productName,
  locale,
  sizes = '(min-width: 1069px) 33vw, (min-width: 641px) 50vw, 100vw',
  variant = 'default',
  showCaption = true,
  fillHeight = false,
}: ProductPhotoProps) {
  const t = getT(locale);
  const photo = photoForAsset(assetId);
  return (
    <figure className={fillHeight ? 'tablet:flex tablet:h-full tablet:flex-col' : undefined}>
      <div
        className={`relative aspect-square overflow-hidden bg-parchment ${fillHeight ? 'tablet:aspect-auto tablet:flex-1' : ''} ${variant === 'catalogue' ? 'rounded-lg' : 'rounded-sm'}`}
      >
        {photo ? (
          <Image
            src={photo.src}
            alt={variant === 'catalogue' ? '' : t('photo.alt', { product: productName })}
            fill
            sizes={sizes}
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-caption text-ink-muted">
            {t('photo.missing')}
          </span>
        )}
      </div>
      {photo && variant !== 'catalogue' && showCaption ? (
        <figcaption className="mt-2 text-fine text-ink-muted">
          {t('photo.representative')} ·{' '}
          <Link
            href={`/${locale}/photo-credits#photo-${photo.key}`}
            className="text-primary underline underline-offset-2"
          >
            {t('photo.credits')}
          </Link>
        </figcaption>
      ) : null}
    </figure>
  );
}
