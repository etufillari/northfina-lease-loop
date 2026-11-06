'use client';
import Link from 'next/link';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { setCart, useCart } from './cart-store';
export function AddToCart({
  id,
  locale,
  available,
  termMonths,
  downPaymentCents,
}: {
  id: string;
  locale: Locale;
  available: boolean;
  termMonths: number;
  downPaymentCents: number;
}) {
  const t = getT(locale);
  const items = useCart();
  const inCart = items.find((item) => item.id === id);
  // Changing the term or down payment offers to add again, so the cart never keeps an old choice.
  const upToDate =
    inCart?.termMonths === termMonths && inCart.downPaymentCents === downPaymentCents;
  const buttonClass = 'min-h-target rounded-pill bg-primary px-6 font-semibold text-white';
  return (
    <div className="mt-6">
      {upToDate ? (
        <Link href={`/${locale}/cart`} className={`${buttonClass} inline-flex items-center`}>
          {t('cart.view')}
        </Link>
      ) : (
        <button
          type="button"
          disabled={!available || (!inCart && items.length >= 10)}
          onClick={() =>
            setCart([
              ...items.filter((item) => item.id !== id),
              { id, termMonths, downPaymentCents },
            ])
          }
          className={`${buttonClass} disabled:opacity-50`}
        >
          {t(available ? 'cart.add' : 'cart.unavailable')}
        </button>
      )}
    </div>
  );
}
