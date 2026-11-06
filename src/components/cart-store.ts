'use client';
import { useSyncExternalStore } from 'react';
export type CartItem = { id: string; termMonths: number; downPaymentCents: number };
const key = 'lease-loop-cart-v2';
const event = 'lease-loop-cart-change';
const empty = '[]';
function snapshot() {
  try {
    return localStorage.getItem(key) ?? empty;
  } catch {
    return empty;
  }
}
function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(event, callback);
    window.removeEventListener('storage', callback);
  };
}
export function useCart(): CartItem[] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => empty);
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is CartItem =>
              item &&
              typeof item.id === 'string' &&
              Number.isSafeInteger(item.termMonths) &&
              Number.isSafeInteger(item.downPaymentCents)
          )
          .slice(0, 10)
      : [];
  } catch {
    return [];
  }
}
export function setCart(items: CartItem[]) {
  localStorage.setItem(key, JSON.stringify(items.slice(0, 10)));
  sessionStorage.removeItem('lease-loop-checkout-token');
  window.dispatchEvent(new Event(event));
}
