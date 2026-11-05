// An item's status as a small pill. Colour is backed by the word, never used alone.
import type { AssetStatus } from '@/data/schemas';
import type { Translate } from '@/i18n/get-t';

const dots: Record<AssetStatus, string> = {
  available: 'bg-emerald-400',
  reserved: 'bg-amber-400',
  returned: 'bg-sky-400',
};

export function StatusBadge({ status, t }: { status: AssetStatus; t: Translate }) {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full bg-[#11131c]/85 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dots[status]}`} />
      <span className="sr-only">{t('status.label')}: </span>
      {t(`status.${status}`)}
    </p>
  );
}
