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

type AssetResponse = { data?: Asset };

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
  const [loadFailed, setLoadFailed] = useState(false);

  const [priceCents, setPriceCents] = useState<number | null>(null);

  const handlePriceChange = useCallback((cents: number | null) => {
    setPriceCents(cents);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAsset() {
      try {
        setLoadingAsset(true);
        setLoadFailed(false);
        setAsset(null);
        setPriceCents(null);

        const response = await fetch(`/api/assets/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        // A 404 is a normal answer: no asset and no failure shows the "not found" state.
        if (response.status === 404) return;

        const body = (await response.json()) as AssetResponse;
        if (!response.ok || !body.data) throw new Error('could not load the asset');

        setAsset(body.data);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setLoadFailed(true);
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
        <p className="text-sm text-stone-500 dark:text-stone-400">{t('asset.loading')}</p>
      </main>
    );
  }

  if (!asset) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href={`/${locale}`}
          className="text-sm text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          ← {t('navigation.backToCatalogue')}
        </Link>

        <div className="mt-8">
          {loadFailed ? (
            <ErrorState
              title={t('asset.loadError')}
              description={t('application.access.errorDescription')}
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
              title={t('asset.notFound')}
              description={t('asset.notFoundDescription')}
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
        <AssetDetails asset={asset} locale={locale} t={t} priceCents={priceCents} />

        <AssetQuotePanel
          assetId={asset.id}
          available={asset.status === 'available'}
          locale={locale}
          t={t}
          onPriceChange={handlePriceChange}
        />
      </div>
    </main>
  );
}
