// Asset photos. Files live in public/images/assets/: drop a <assetId>.jpg there and the
// catalogue picks it up; staff uploads (e.g. after a refurbishment changed the look) are
// stored next to them and win via Asset.image_path.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from './audit';

export const ASSET_IMAGE_DIR = path.join(process.cwd(), 'public', 'images', 'assets');
export const ASSET_IMAGE_URL_BASE = '/images/assets';

/** Extensions the conventional <assetId>.<ext> lookup tries, in order. */
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

const EXTENSION_BY_MIME: Record<string, (typeof EXTENSIONS)[number]> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** A safe public/images/assets file name: no separators, so no path can escape the folder. */
function isSafeName(name: string): boolean {
  return /^[\w.-]+$/.test(name) && !name.includes('..');
}

/**
 * The URL to show for an asset, or null for the placeholder: the staff upload when there is
 * one, else the conventional <assetId>.<ext> file when it exists on disk.
 */
export function assetImageUrl(asset: { id: string; image_path?: string | null }): string | null {
  if (asset.image_path && isSafeName(asset.image_path)) {
    if (existsSync(path.join(ASSET_IMAGE_DIR, asset.image_path))) {
      return `${ASSET_IMAGE_URL_BASE}/${asset.image_path}`;
    }
  }
  for (const ext of EXTENSIONS) {
    const name = `${asset.id}.${ext}`;
    if (existsSync(path.join(ASSET_IMAGE_DIR, name))) return `${ASSET_IMAGE_URL_BASE}/${name}`;
  }
  return null;
}

/** The image URL for many assets in one go (asset id → URL or null). */
export function assetImageUrls(
  assets: ReadonlyArray<{ id: string; image_path?: string | null }>
): Record<string, string | null> {
  return Object.fromEntries(assets.map((asset) => [asset.id, assetImageUrl(asset)]));
}

export type SaveImageResult =
  { ok: true; url: string } | { ok: false; reason: 'not_found' | 'bad_type' | 'too_large' };

/**
 * Stores an uploaded photo for an asset and points the asset at it. Each upload gets a new
 * file name, so the previous life's photo stays on disk for the passport's history.
 */
export async function saveAssetImage(
  db: PrismaClient,
  input: { assetId: string; file: File; actor: string }
): Promise<SaveImageResult> {
  const asset = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) return { ok: false, reason: 'not_found' };
  const extension = EXTENSION_BY_MIME[input.file.type];
  if (!extension) return { ok: false, reason: 'bad_type' };
  if (input.file.size > MAX_IMAGE_BYTES) return { ok: false, reason: 'too_large' };

  const fileName = `${input.assetId}-${Date.now()}.${extension}`;
  await mkdir(ASSET_IMAGE_DIR, { recursive: true });
  await writeFile(
    path.join(ASSET_IMAGE_DIR, fileName),
    Buffer.from(await input.file.arrayBuffer())
  );

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.image_changed',
      entityType: 'asset',
      entityId: input.assetId,
      details: { from: asset.image_path, to: fileName },
    },
    (tx) => tx.asset.update({ where: { id: input.assetId }, data: { image_path: fileName } })
  );
  return { ok: true, url: `${ASSET_IMAGE_URL_BASE}/${fileName}` };
}
