import { access } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAssets } from './load';
import { photoByAsset, photoForAsset, productPhotos } from './product-photos';

describe('illustrative product photos', () => {
  it('maps every data-pack asset to a local, credited image', async () => {
    const assets = await loadAssets();
    expect(Object.keys(photoByAsset).sort()).toEqual(assets.map((asset) => asset.id).sort());
    for (const asset of assets) {
      const photo = photoForAsset(asset.id);
      expect(photo?.author).toBeTruthy();
      expect(photo?.source).toMatch(/^https:\/\//);
      expect(photo?.license).toMatch(/^https:\/\//);
      await access(path.join(process.cwd(), 'public', photo!.src));
    }
    expect(new Set(Object.values(photoByAsset))).toEqual(new Set(Object.keys(productPhotos)));
  });
  it('shares images for units of the same model and handles unknown IDs safely', async () => {
    const assets = await loadAssets();
    const byModel = new Map<string, string>();
    for (const asset of assets) {
      const model = `${asset.make} ${asset.model}`;
      const photo = photoForAsset(asset.id)?.src;
      if (byModel.has(model)) expect(photo).toBe(byModel.get(model));
      else if (photo) byModel.set(model, photo);
    }
    expect(photoForAsset('unknown')).toBeUndefined();
    expect(photoForAsset('__proto__')).toBeUndefined();
  });
});
