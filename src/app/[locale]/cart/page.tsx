import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { headers } from 'next/headers';
import { readIdentity } from '@/server/auth-session';
import { applicationItemsSchema, findCustomerApplication } from '@/server/applications';
import { applicationCart } from '@/domain/application-cart';
import { priceChanges, quoteStillValid } from '@/domain/price-lock';
import { formatIsoDate } from '@/i18n/format';
import { db } from '@/server/db';
import { CartPage } from '@/components/cart-page';
import { isLocale } from '@/i18n/locales';
import { checkoutOptions } from '@/server/checkout-options';
import { appToday } from '@/server/demo-mode';

export default async function Page({ params, searchParams }: PageProps<'/[locale]/cart'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const query = await searchParams;
  const id = typeof query.application === 'string' ? query.application : undefined;
  const identity = id ? await readIdentity(db, await headers()) : null;
  const application =
    id && identity ? await findCustomerApplication(db, identity.customerId, id) : null;
  const today = await appToday();
  const usable =
    application?.status === 'approved' && quoteStillValid(application.startDate, today)
      ? application
      : null;
  const data = await checkoutOptions(today);
  // Card 2: compare the approved quote with today's prices, so the customer sees any change
  // and accepts it before signing. Checkout enforces the same rule on the server.
  const quoted = usable ? applicationItemsSchema.parse(JSON.parse(usable.itemsJson)) : [];
  const current = quoted.length ? applicationCart(data, quoted) : null;
  return (
    <CartPage
      key={usable?.id ?? 'cart'}
      locale={locale}
      data={data}
      applicationId={usable?.id}
      priceChanges={current ? priceChanges(quoted, current.items) : []}
      quotedOn={usable ? formatIsoDate(usable.startDate, locale) : ''}
    />
  );
}
