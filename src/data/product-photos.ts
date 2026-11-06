/** Curated, licensed illustrative photos. Source records are separate from the synthetic data pack. */
export type ProductPhoto = {
  src: string;
  author: string;
  title?: string;
  source: string;
  license: string;
  licenseName: string;
};
const pexels = (file: string, author: string, slug: string): ProductPhoto => ({
  src: `/product-images/${file}.jpg`,
  author,
  source: `https://www.pexels.com/photo/${slug}/`,
  license: 'https://www.pexels.com/license/',
  licenseName: 'Pexels License',
});

export const productPhotos = {
  urban: pexels('urban-bike', 'Erik Mclean', 'a-black-bicycle-parked-on-the-street-8811560'),
  step: pexels('step-bike', 'Team EVELO', 'a-white-electric-bike-is-parked-on-the-beach-15009892'),
  trail: pexels('trail-bike', 'Luis Andrade', 'bike-in-a-mountain-valley-18292773'),
  cargo: pexels(
    'cargo-bike',
    'Jean Fourche',
    'yellow-cargo-e-bike-with-parcels-outside-pickup-station-31638922'
  ),
  commuter: pexels('commuter-bike', 'Team EVELO', 'a-bike-parked-beside-brick-wall-15020731'),
  folding: pexels('folding-bike', 'G-FORCE Bike', 'an-electric-bike-parked-on-the-street-14474986'),
  gravel: pexels(
    'gravel-bike',
    'Team EVELO',
    'black-bicycle-parked-beside-a-concrete-wall-15020728'
  ),
  child: pexels('child-bike', 'Jan van der Wolf', 'pink-child-bicycle-parked-on-street-14576823'),
  air: pexels('laptop-air', 'AS Photography', 'silver-laptop-computer-on-table-291777'),
  pro: pexels('laptop-pro', 'Artem Podrez', 'black-and-silver-laptop-on-a-white-table-4884124'),
  office: pexels('laptop-office', 'Polina Zimmerman', 'laptop-on-white-table-3747090'),
  gaming: pexels(
    'laptop-gaming',
    'Matheus Bertelli',
    'a-modern-gaming-laptop-with-a-light-up-keyboard-19012049'
  ),
  tractorRed: pexels('tractor-red', 'Greta Hoffman', 'red-tractor-working-in-field-7728672'),
  tractorField: pexels('tractor-field', 'Dariusz Grosa', 'a-tractor-in-the-field-2332736'),
  combine: pexels('combine', 'Songhan Wu', 'a-combine-harvester-in-a-field-10893497'),
  seedDrill: pexels(
    'seed-drill',
    'David McElwee',
    'john-deere-hoe-seed-drill-an-agricultural-planting-machine-16407472'
  ),
  mower: pexels('mower', 'William Hadley', 'stormy-day-tractor-mowing-a-lush-green-field-29865261'),
  wrapper: {
    src: '/product-images/bale-wrapper.jpg',
    author: 'Carl Wycoff',
    title: 'AM Stretch-O-Matic 7500 tubular bale wrapper',
    source:
      'https://commons.wikimedia.org/wiki/File:AM_Stretch-O-Matic_7500_tubular_bale_wrapper.jpg',
    license: 'https://creativecommons.org/licenses/by/2.0/',
    licenseName: 'CC BY 2.0',
  },
  milker: {
    src: '/product-images/milking-robot.jpg',
    author: '.Anja.',
    title: 'Cow in milking robot 01',
    source: 'https://commons.wikimedia.org/wiki/File:Cow_in_milking_robot_01.jpg',
    license: 'https://creativecommons.org/licenses/by-sa/4.0/',
    licenseName: 'CC BY-SA 4.0',
  },
} satisfies Record<string, ProductPhoto>;

export type ProductPhotoKey = keyof typeof productPhotos;

/** Units of the same model intentionally use the same illustrative photo. */
export const photoByAsset: Readonly<Record<string, ProductPhotoKey>> = {
  'ebike-001': 'urban',
  'ebike-002': 'step',
  'ebike-003': 'trail',
  'ebike-004': 'cargo',
  'ebike-005': 'commuter',
  'ebike-006': 'folding',
  'ebike-007': 'cargo',
  'ebike-008': 'urban',
  'ebike-009': 'gravel',
  'ebike-010': 'child',
  'ebike-011': 'cargo',
  'ebike-012': 'trail',
  'laptop-001': 'air',
  'laptop-002': 'pro',
  'laptop-003': 'pro',
  'laptop-004': 'office',
  'laptop-005': 'air',
  'laptop-006': 'air',
  'laptop-007': 'office',
  'laptop-008': 'gaming',
  'laptop-009': 'office',
  'laptop-010': 'pro',
  'farm-001': 'tractorRed',
  'farm-002': 'tractorField',
  'farm-003': 'wrapper',
  'farm-004': 'seedDrill',
  'farm-005': 'tractorRed',
  'farm-006': 'combine',
  'farm-007': 'milker',
  'farm-008': 'mower',
};

export function photoForAsset(
  assetId: string
): (ProductPhoto & { key: ProductPhotoKey }) | undefined {
  if (!Object.hasOwn(photoByAsset, assetId)) return undefined;
  const key = photoByAsset[assetId];
  return key ? { ...productPhotos[key], key } : undefined;
}
