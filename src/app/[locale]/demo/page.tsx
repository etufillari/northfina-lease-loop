// The demo page, the one entry point to the demo tools (issue #35): the clock override that
// lets the judges run a dated scenario card on its own day, one Run button per scenario card
// (docs/features/demo-cards.md) and the audit log with its chain badge.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AuditChainBadge } from '@/components/audit-chain-badge';
import {
  Badge,
  buttonClasses,
  Card,
  DateText,
  HashLink,
  LinkButton,
  Notice,
  PageHeader,
  StaffNote,
} from '@/components/ui';
import { loadCustomers } from '@/data/load';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { verifyAuditChain } from '@/server/audit';
import { db } from '@/server/db';
import { DEMO_CARDS } from '@/server/demo-cards';
import { readDemoClock } from '@/server/demo-clock';
import { CardList } from './card-list';
import { ClockForm } from './clock-form';

/** The dates the scenario cards and the pitch need most: the two hackathon days and the VAT year. */
const PRESET_DAYS = ['2026-11-05', '2026-11-06', '2027-01-01'];

export async function generateMetadata({ params }: PageProps<'/[locale]/demo'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('demo.title') }) };
}

export default async function DemoPage({ params }: PageProps<'/[locale]/demo'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const [clock, verdict, customers] = await Promise.all([
    readDemoClock(),
    verifyAuditChain(db),
    loadCustomers(),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const tools = [
    { href: '#demo-clock', label: t('demo.clock.title') },
    { href: '#demo-cards', label: t('demo.cards.title') },
    { href: '#demo-audit', label: t('demo.audit.title') },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('demo.title')} intro={t('demo.intro')}>
        <StaffNote>{t('staff.note')}</StaffNote>
      </PageHeader>

      <nav aria-label={t('demo.tools.title')} className="mb-8">
        <p className="mb-2 font-medium">{t('demo.tools.title')}</p>
        <ul className="flex flex-wrap gap-2">
          {tools.map((tool) => (
            <li key={tool.href}>
              {/* HashLink scrolls on every click: a plain link does nothing when the URL
                  already ends in the same hash, so a second "Audit log" click went dead. */}
              <HashLink href={tool.href} className={buttonClasses('secondary', 'sm')}>
                {tool.label}
              </HashLink>
            </li>
          ))}
        </ul>
      </nav>

      <Card as="section" title={t('demo.clock.title')} titleId="demo-clock">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <p className="text-lg">
            {t('demo.clock.today')}{' '}
            <strong className="font-semibold">
              <DateText iso={clock.today} locale={locale} />
            </strong>
          </p>
          <Badge tone={clock.overridden ? 'warning' : 'success'}>
            {clock.overridden ? t('demo.clock.moved') : t('demo.clock.real')}
          </Badge>
        </div>
        {clock.overridden ? (
          <Notice tone="warning" className="mb-6">
            {t('demo.clock.movedNote', { date: formatIsoDate(clock.systemToday, locale) })}
          </Notice>
        ) : null}
        <ClockForm
          key={clock.today}
          today={clock.today}
          overridden={clock.overridden}
          presets={PRESET_DAYS.map((iso) => ({ iso, label: formatIsoDate(iso, locale) }))}
          labels={{
            date: t('demo.clock.date'),
            dateHint: t('demo.clock.dateHint'),
            travel: t('demo.clock.travel'),
            presets: t('demo.clock.presets'),
            reset: t('demo.clock.reset'),
            pending: t('demo.clock.pending'),
            error: t('demo.clock.error'),
          }}
        />
      </Card>

      <Card as="section" title={t('demo.cards.title')} titleId="demo-cards" className="mt-8">
        <p className="mb-4 text-ink-muted">{t('demo.cards.intro')}</p>
        <CardList cards={DEMO_CARDS} names={names} locale={locale} t={t} />
      </Card>

      <Card as="section" title={t('demo.audit.title')} titleId="demo-audit" className="mt-8">
        <p className="mb-4 text-ink-muted">{t('demo.audit.intro')}</p>
        <AuditChainBadge verdict={verdict} t={t} />
        <LinkButton href={`/${locale}/audit`} variant="secondary" size="sm">
          {t('demo.audit.open')}
        </LinkButton>
        <p className="mt-4 text-sm text-ink-muted">
          {t('demo.audit.tamper', { command: 'npm run demo:tamper' })}
        </p>
      </Card>
    </div>
  );
}
