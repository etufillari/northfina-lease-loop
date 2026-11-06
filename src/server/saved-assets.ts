import { cookies } from 'next/headers';
import { SAVED_ASSETS_COOKIE } from '@/active-user';

type SavedAssets = Record<string, string[]>;

export async function getSavedAssetIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const value = (await cookies()).get(SAVED_ASSETS_COOKIE)?.value;
  if (!value) return [];

  try {
    const saved = JSON.parse(value) as SavedAssets;
    return Array.isArray(saved[userId]) ? saved[userId] : [];
  } catch {
    return [];
  }
}
