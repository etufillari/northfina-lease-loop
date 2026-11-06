'use client';

import type { Locale } from '@/i18n/locales';
import { CustomerJourney } from './customer-journey';
import { DealerJourney } from './dealer-journey';
import { emptySelection, selectionSchema } from './draft';
import { useDraft } from './use-draft';

/** Unmount the other role's workspace; its persisted customer draft is left intact. */
export function Journey({ assetId, locale }: { assetId: string; locale: Locale }) {
  const [selection] = useDraft('lease-loop-demo', emptySelection, selectionSchema);
  return selection.role === 'operator' ? (
    <DealerJourney key={assetId} assetId={assetId} locale={locale} />
  ) : (
    <CustomerJourney key={assetId} assetId={assetId} locale={locale} />
  );
}
