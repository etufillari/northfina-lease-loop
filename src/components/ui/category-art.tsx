// The picture slot for an item: a studio photo on a tile of the same colour, so every card in a
// row has the same shape and weight. Each category has one photo; a few models have their own,
// so the catalogue doesn't look like one item repeated. Decorative: the make and model beside it
// name the item.
import Image from 'next/image';
import type { Asset, AssetCategory } from '@/data/schemas';

type Photo = { src: string; backdrop: string };

// Each photo sits on its own studio backdrop, so the tile takes that colour and the photo is
// contained, not cropped, whatever shape the tile has. A photo with a vignette gets a gradient
// that matches its top and bottom edges (its sides are faded into that gradient in the file itself).
const categoryPhotos: Record<AssetCategory, Photo> = {
  e_bike: { src: '/images/e-bike.webp', backdrop: '#21242b' },
  laptop: { src: '/images/laptop.webp', backdrop: '#222224' },
  farm_machine: { src: '/images/farm-machine.webp', backdrop: '#242426' },
};

const mtb: Photo = { src: '/images/e-bike-mtb.webp', backdrop: '#25262b' };
const proLaptop: Photo = { src: '/images/laptop-pro.webp', backdrop: '#1c2431' };

// Keyed by model name (data/assets.json), so every unit of a model shares its photo.
const modelPhotos: Record<string, Photo> = {
  'Trail 500': mtb,
  'Gravel X': mtb,
  'Pro 14': proLaptop,
  'Pro 16': proLaptop,
  'Gamer 17': { src: '/images/laptop-gamer.webp', backdrop: '#202328' },
  'T-140 Tractor': {
    src: '/images/farm-machine-t140.webp',
    backdrop: 'linear-gradient(#080c16, #141c2d)',
  },
};

export function CategoryArt({
  asset,
  className = '',
  children,
}: {
  asset: Pick<Asset, 'category' | 'model'>;
  className?: string;
  children?: React.ReactNode;
}) {
  const photo = modelPhotos[asset.model] ?? categoryPhotos[asset.category];
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: photo.backdrop }}>
      <Image
        src={photo.src}
        alt=""
        fill
        sizes="(min-width: 1024px) 40vw, (min-width: 640px) 50vw, 100vw"
        className="object-contain transition-transform duration-500 ease-out group-hover:scale-105"
      />
      {children}
    </div>
  );
}
