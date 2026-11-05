// Which life an item is on: a new item is on life 1, after one lease it's on life 2, and so on.
// The dots fill up to three; the label always gives the exact number.
import type { Translate } from '@/i18n/get-t';

export function LivesMeter({ previousLives, t }: { previousLives: number; t: Translate }) {
  const life = previousLives + 1;
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full bg-[#11131c]/85 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
      <span aria-hidden="true" className="flex gap-0.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`size-1.5 rounded-full border border-current ${n <= life ? 'border-[#ff7a59] bg-[#ff7a59]' : 'opacity-60'}`}
          />
        ))}
      </span>
      {t('asset.life', { number: life })}
    </p>
  );
}
