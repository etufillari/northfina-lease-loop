// POST /api/assets/:id/image  multipart form: file, actor
// Staff upload a new photo for an asset — e.g. while refurbishing, when the item no longer
// looks like the previous life's picture. JPEG, PNG or WebP, at most 5 MB.
import { fail, handleRoute, ok } from '@/server/api-response';
import { MAX_IMAGE_BYTES, saveAssetImage } from '@/server/asset-images';
import { db } from '@/server/db';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/image'>) => {
    const { id } = await params;
    const form = await request.formData().catch(() => null);
    if (!form) return fail(400, 'BAD_FORM', 'Expected a multipart form');
    const file = form.get('file');
    const actor = form.get('actor');
    if (!(file instanceof File)) return fail(400, 'NO_FILE', 'Attach the photo as "file"');
    if (typeof actor !== 'string' || actor.trim() === '') {
      return fail(400, 'NO_ACTOR', 'Say who is uploading as "actor"');
    }

    const result = await saveAssetImage(db, { assetId: id, file, actor: actor.trim() });
    if (!result.ok) {
      if (result.reason === 'not_found') return fail(404, 'ASSET_NOT_FOUND', 'No such asset');
      if (result.reason === 'bad_type')
        return fail(415, 'BAD_TYPE', 'Use a JPEG, PNG or WebP image');
      return fail(
        413,
        'TOO_LARGE',
        `The photo is over ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB`
      );
    }
    return ok({ url: result.url });
  }
);
