// The viewer for the current request, read from their cookie (see viewer.ts).
import { cookies } from 'next/headers';
import { loadCustomers } from '@/data/load';
import { resolveViewer, VIEWER_COOKIE, type Viewer } from './viewer';

export async function currentViewer(): Promise<Viewer> {
  const [store, customers] = await Promise.all([cookies(), loadCustomers()]);
  return resolveViewer(store.get(VIEWER_COOKIE)?.value, customers);
}
