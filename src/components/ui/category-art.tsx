// The picture slot for an item: the category photo on a tile of the same colour, so every card in
// a row has the same shape and weight. The photos are shared per category, not per item.
// Decorative: the make and model beside it name the item.
import Image from 'next/image';
import type { AssetCategory } from '@/data/schemas';

// Each photo sits on its own studio backdrop, so the tile takes that colour and the photo is
// contained, not cropped, whatever shape the tile has.
const photos: Record<AssetCategory, { src: string; backdrop: string }> = {
  e_bike: { src: '/images/e-bike.webp', backdrop: '#21242b' },
  laptop: { src: '/images/laptop.webp', backdrop: '#222224' },
  farm_machine: { src: '/images/farm-machine.webp', backdrop: '#242426' },
};

export function CategoryArt({
  category,
  className = '',
  children,
}: {
  category: AssetCategory;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: photos[category].backdrop }}
    >
      <Image
        src={photos[category].src}
        alt=""
        fill
        sizes="(min-width: 1024px) 40vw, (min-width: 640px) 50vw, 100vw"
        className="object-contain transition-transform duration-500 ease-out group-hover:scale-105"
      />
      {children}
    </div>
  );
}
