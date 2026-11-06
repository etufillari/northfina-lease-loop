'use client';

import type { MouseEvent } from 'react';
import { SAVED_ASSETS_COOKIE } from '@/active-user';

export function SaveAssetButton({
  assetId,
  userId,
  saved,
  label,
}: {
  assetId: string;
  userId: string | null;
  saved: boolean;
  label: string;
}) {
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!userId) return;

    const current = readCookie();
    const userAssets = new Set(current[userId] ?? []);
    if (userAssets.has(assetId)) userAssets.delete(assetId);
    else userAssets.add(assetId);
    current[userId] = [...userAssets];
    document.cookie = `${SAVED_ASSETS_COOKIE}=${encodeURIComponent(JSON.stringify(current))}; path=/; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={saved}
      onClick={toggle}
      className="absolute top-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-lg leading-none text-[#101d46] shadow-sm hover:bg-white"
    >
      {saved ? '♥' : '♡'}
    </button>
  );
}

function readCookie(): Record<string, string[]> {
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${SAVED_ASSETS_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=');
  if (!value) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<string, string[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
