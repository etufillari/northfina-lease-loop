'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import type { Asset } from '@/data/schemas';
import type { Locale } from '@/i18n/locales';

import { AssetDetails } from '@/components/asset-details';
import { AssetQuotePanel } from '@/components/asset-quote-panel';

import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';

import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';

type PageProps = {
  params: Promise<{
    locale: string;
    id: string;
  }>;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: {
    timestamp: string;
  };
};

type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

type ApiResponse<T> = ApiSuccess<T> | ApiError;

export default function AssetDetailsPage({ params }: PageProps) {
  const { locale: localeParam, id } = use(params);

  if (!isLocale(localeParam)) {
    return null;
  }

  return <AssetDetailsContent locale={localeParam} id={id} />;
}

function AssetDetailsContent({ locale, id }: { locale: Locale; id: string }) {
  const t = getT(locale);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);

  const [unitPriceCents, setUnitPriceCents] = useState<number | null>(null);

  const handleUnitPriceChange = useCallback((cents: number | null) => {
    setUnitPriceCents(cents);
  }, []);

  // Load the asset from the existing catalogue API.
  useEffect(() => {
    const controller = new AbortController();

    async function loadAsset() {
      try {
        setLoadingAsset(true);
        setAssetError(null);
        setAsset(null);
        setUnitPriceCents(null);

        const response = await fetch('/api/assets', {
          signal: controller.signal,
        });

        const body = (await response.json()) as ApiResponse<Asset[]>;

        if (!response.ok || !body.success) {
          throw new Error(body.success ? 'Unable to load asset' : body.error.message);
        }

        const found = body.data.find((item) => item.id === id);

        if (!found) {
          setAssetError('Asset not found');
          return;
        }

        setAsset(found);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setAssetError(error instanceof Error ? error.message : 'Unable to load asset');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingAsset(false);
        }
      }
    }

    void loadAsset();

    return () => controller.abort();
  }, [id]);

  if (loadingAsset) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading...</p>
      </main>
    );
  }

  if (assetError || !asset) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href={`/${locale}`}
          className="text-sm text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          ← {t('navigation.backToCatalogue')}
        </Link>

        <div className="mt-8">
          {assetError ? (
            <ErrorState
              title="Unable to load asset"
              description={assetError}
              action={
                <Link
                  href={`/${locale}`}
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                >
                  ← {t('navigation.backToCatalogue')}
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="Asset not found"
              description="The asset may have been removed or is no longer available."
              action={
                <Link
                  href={`/${locale}`}
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                >
                  ← {t('navigation.backToCatalogue')}
                </Link>
              }
            />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link
        href={`/${locale}`}
        className="inline-flex items-center gap-2 text-sm text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        ← {t('navigation.backToCatalogue')}
      </Link>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <AssetDetails asset={asset} locale={locale} t={t} unitPriceCents={unitPriceCents} />

        <AssetQuotePanel
          assetId={asset.id}
          available={asset.status === 'available'}
          locale={locale}
          t={t}
          onUnitPriceChange={handleUnitPriceChange}
        />
      </div>
    </main>
  );
}
