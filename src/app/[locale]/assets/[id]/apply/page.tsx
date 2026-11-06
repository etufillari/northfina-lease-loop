import { notFound } from 'next/navigation';

import ApplicationFlow from '@/components/application/application-flow';

import { isLocale } from '@/i18n/locales';

type PageProps = {
  params: Promise<{
    locale: string;
    id: string;
  }>;
  searchParams: Promise<{
    term?: string;
    down?: string;
    quantity?: string;
  }>;
};

const VALID_TERMS = [12, 24, 36, 48];

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export default async function ApplyPage({ params, searchParams }: PageProps) {
  const [{ locale: localeParam, id }, query] = await Promise.all([params, searchParams]);

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;

  const requestedTerm = parsePositiveInt(query.term, 36);
  const termMonths = VALID_TERMS.includes(requestedTerm) ? requestedTerm : 36;

  const quantity = Math.min(1000, parsePositiveInt(query.quantity, 1));

  const downPaymentCents = parseNonNegativeInt(query.down, 0);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8 dark:bg-stone-950 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <ApplicationFlow
          assetId={id}
          locale={locale}
          quantity={quantity}
          termMonths={termMonths}
          downPaymentCents={downPaymentCents}
        />
      </div>
    </main>
  );
}
