// The second-life waiting list. A customer joins it, sees what they are waiting for and
// answers offers in their own section (accepting starts the normal application). Staff see
// the whole list in queue order, category by category.
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { customerPersona, PERSONA_COOKIE, STAFF_PERSONA } from '@/components/persona-cookie';
import { getT, type MessageKey } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { customerWaitlist, staffWaitlist } from '@/server/waitlist-views';
import { EntryCard } from './entry-card';
import { JoinForm, type JoinPrefill } from './join-form';

export default async function WaitlistPage({
  params,
  searchParams,
}: PageProps<'/[locale]/waitlist'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const query = await searchParams;
  const { asOf, asOfParam } = await asOfFromPage(query);
  // The catalogue's "no matches" prompt prefills the join form through the URL.
  const single = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : undefined;
  const prefill: JoinPrefill = {
    category: single(query.category),
    minBudget: single(query.minBudget),
    maxBudget: single(query.maxBudget),
    minCondition: single(query.minCondition),
    term: single(query.term),
  };
  const raw = (await cookies()).get(PERSONA_COOKIE)?.value ?? null;
  const customerId = customerPersona(raw);
  const customer = customerId ? await getCustomer(db, customerId) : null;
  const isStaff = raw === STAFF_PERSONA;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('waitlist.title')}</h1>
      <p className="mt-2 max-w-3xl text-stone-700 dark:text-stone-300">{t('waitlist.intro')}</p>

      {customer ? (
        <CustomerSection
          locale={locale}
          customerId={customer.id}
          asOf={asOf}
          asOfParam={asOfParam}
          prefill={prefill}
        />
      ) : isStaff ? (
        <StaffSection locale={locale} asOf={asOf} asOfParam={asOfParam} />
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('me.noPersona')}
        </p>
      )}
    </div>
  );
}

async function CustomerSection({
  locale,
  customerId,
  asOf,
  asOfParam,
  prefill,
}: {
  locale: Parameters<typeof getT>[0];
  customerId: string;
  asOf: string;
  asOfParam: string | null;
  prefill: JoinPrefill;
}) {
  const t = getT(locale);
  const views = await customerWaitlist(db, customerId, asOf);
  const offers = views.filter((view) => view.entry.status !== 'waiting');
  const waiting = views.filter((view) => view.entry.status === 'waiting');
  return (
    <>
      {offers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('waitlist.offers')}</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            {t('waitlist.offersIntro')}
          </p>
          <div className="mt-4 space-y-4">
            {offers.map((view) => (
              <EntryCard
                key={view.entry.id}
                locale={locale}
                view={view}
                actor={customerId}
                asOfParam={asOfParam}
              />
            ))}
          </div>
        </section>
      )}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('waitlist.yours')}</h2>
        {waiting.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('waitlist.none')}</p>
        ) : (
          <div className="mt-4 space-y-4">
            {waiting.map((view) => (
              <EntryCard
                key={view.entry.id}
                locale={locale}
                view={view}
                actor={customerId}
                asOfParam={asOfParam}
              />
            ))}
          </div>
        )}
      </section>
      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t('waitlist.join.title')}</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('waitlist.join.intro')}
        </p>
        <JoinForm
          locale={locale}
          customerId={customerId}
          asOf={asOf}
          asOfParam={asOfParam}
          prefill={prefill}
        />
      </section>
    </>
  );
}

async function StaffSection({
  locale,
  asOf,
  asOfParam,
}: {
  locale: Parameters<typeof getT>[0];
  asOf: string;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const views = await staffWaitlist(db, asOf);
  const categories = [...new Set(views.map((v) => v.entry.category))];
  return (
    <>
      {categories.map((category) => (
        <section key={category} className="mt-8">
          <h2 className="text-lg font-semibold">{t(`category.${category}` as MessageKey)}</h2>
          <div className="mt-4 space-y-4">
            {views
              .filter((v) => v.entry.category === category)
              .map((view) => (
                <EntryCard
                  key={view.entry.id}
                  locale={locale}
                  view={view}
                  actor={null}
                  asOfParam={asOfParam}
                />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
