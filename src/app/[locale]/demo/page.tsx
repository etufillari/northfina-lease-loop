// The demo panel (D-058): run each scenario card from its starting point, see the rules in force on
// the demo date, and reach the back office, the live contracts and the audit trail. Read-only: it
// only sets the demo date and links to the pages where each card runs. It never shows a result.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { DemoRules } from '@/components/demo-rules';
import { DemoRunButton } from '@/components/demo-run-button';
import { loadCustomers } from '@/data/load';
import {
  DEMO_SCENARIOS,
  scenarioHref,
  shiftAsOf,
  type DemoScenario,
  type ScenarioStep,
} from '@/domain/demo-scenarios';
import { rulesInForce } from '@/domain/rules-in-force';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey, type Translate } from '@/i18n/get-t';
import { isLocale, type Locale } from '@/i18n/locales';
import { asOf } from '@/server/as-of';
import { db } from '@/server/db';
import { loadDemoPanel, resolveScenarioTarget, type DemoPanelData } from '@/server/demo-panel';
import { loadLeaseDataPack } from '@/server/lease-data';

export async function generateMetadata({ params }: PageProps<'/[locale]/demo'>): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)('demo.title') } : {};
}

export default async function DemoPage({ params }: PageProps<'/[locale]/demo'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const when = await asOf();
  const [data, panel, customers] = await Promise.all([
    loadLeaseDataPack(),
    loadDemoPanel(db),
    loadCustomers(),
  ]);
  const rules = rulesInForce(data, when.date);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const assetName = new Map(panel.assets.map((a) => [a.id, `${a.make} ${a.model}`]));
  const returned = panel.assets.filter((a) => a.status === 'returned');
  const waiting = panel.contracts.filter((c) => !c.ended && c.status === 'awaiting_signatory');
  const live = panel.contracts.filter((c) => !c.ended && c.status === 'active');
  const counts = (['available', 'reserved', 'returned', 'sold'] as const).map(
    (status) => [status, panel.assets.filter((a) => a.status === status).length] as const
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight uppercase sm:text-4xl">
        {t('demo.title')}
      </h1>
      <p className="mt-2 max-w-3xl text-muted">{t('demo.intro')}</p>

      <section
        aria-labelledby="demo-today"
        className="panel mt-8 flex flex-wrap items-center gap-4 p-5"
      >
        <div className="mr-auto">
          <h2 id="demo-today" className="eyebrow">
            {t('demo.today')}
          </h2>
          <p className="mt-1 font-display text-xl font-bold">{formatIsoDate(when.date, locale)}</p>
        </div>
        <DemoRunButton
          locale={locale}
          asOf={shiftAsOf(when.date, { months: 1 })}
          label={t('demo.shift.month')}
          variant="ghost"
        />
        <DemoRunButton
          locale={locale}
          asOf={shiftAsOf(when.date, { months: 12 })}
          label={t('demo.shift.year')}
          variant="ghost"
        />
      </section>

      <section aria-labelledby="demo-cards" className="mt-10">
        <h2 id="demo-cards" className="font-display text-xl font-bold uppercase">
          {t('demo.cards')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('demo.cardsIntro')}</p>
        <ol className="mt-4 grid gap-3 lg:grid-cols-2">
          {DEMO_SCENARIOS.map((scenario) => (
            <ScenarioCard
              key={scenario.card}
              scenario={scenario}
              panel={panel}
              locale={locale}
              t={t}
            />
          ))}
        </ol>
      </section>

      <section aria-labelledby="demo-rules" className="mt-10">
        <h2 id="demo-rules" className="font-display text-xl font-bold uppercase">
          {t('demo.rules', { date: formatIsoDate(when.date, locale) })}
        </h2>
        <div className="mt-4">
          <DemoRules rules={rules} locale={locale} />
        </div>
      </section>

      <section aria-labelledby="demo-office" className="mt-10">
        <h2 id="demo-office" className="font-display text-xl font-bold uppercase">
          {t('demo.office')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('demo.officeIntro')}</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="panel p-5">
            <h3 className="eyebrow">{t('demo.office.returned')}</h3>
            <LinkList
              empty={t('demo.office.returnedEmpty')}
              items={returned.map((a) => ({
                key: a.id,
                href: `/${locale}/assets/${a.id}`,
                label: `${a.make} ${a.model}`,
                note: a.id,
              }))}
            />
          </div>
          <div className="panel p-5">
            <h3 className="eyebrow">{t('demo.office.waiting')}</h3>
            <LinkList
              empty={t('demo.office.waitingEmpty')}
              items={waiting.map((c) => ({
                key: String(c.id),
                href: `/${locale}/contracts/${c.id}`,
                label: t('demo.contract', { id: c.id }),
                note: `${customerName.get(c.customerId) ?? c.customerId} · ${assetName.get(c.assetId) ?? c.assetId}`,
              }))}
            />
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {counts.map(([status, count]) => (
            <li key={status} className="rounded-full border border-line px-3 py-1">
              {t(`status.${status}` as MessageKey)}: <strong>{count}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="demo-contracts" className="mt-10">
        <h2 id="demo-contracts" className="font-display text-xl font-bold uppercase">
          {t('demo.contracts')}
        </h2>
        {live.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line p-6 text-muted">
            {t('demo.contracts.empty')}
          </p>
        ) : (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs tracking-wide text-muted uppercase">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-semibold">{t('demo.contracts.contract')}</th>
                  <th className="px-4 py-3 font-semibold">{t('demo.contracts.customer')}</th>
                  <th className="px-4 py-3 font-semibold">{t('demo.contracts.item')}</th>
                  <th className="px-4 py-3 font-semibold">{t('demo.contracts.start')}</th>
                </tr>
              </thead>
              <tbody>
                {live.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        className="font-semibold underline"
                        href={`/${locale}/contracts/${c.id}`}
                      >
                        {t('demo.contract', { id: c.id })}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{customerName.get(c.customerId) ?? c.customerId}</td>
                    <td className="px-4 py-3">{assetName.get(c.assetId) ?? c.assetId}</td>
                    <td className="px-4 py-3">{formatIsoDate(c.startDate, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        aria-labelledby="demo-audit"
        className="panel mt-10 flex flex-wrap items-center gap-4 p-5"
      >
        <div className="mr-auto">
          <h2 id="demo-audit" className="eyebrow">
            {t('demo.audit')}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {t('demo.audit.count', { count: panel.auditCount })}
          </p>
        </div>
        <Link href={`/${locale}/audit`} className="btn-ghost px-4 py-1.5">
          {t('demo.audit.open')}
        </Link>
      </section>
    </div>
  );
}

function ScenarioCard({
  scenario,
  panel,
  locale,
  t,
}: {
  scenario: DemoScenario;
  panel: DemoPanelData;
  locale: Locale;
  t: Translate;
}) {
  const key = (suffix: string) => `demo.card.${scenario.key}.${suffix}` as MessageKey;
  return (
    <li className="panel flex flex-col gap-3 p-5">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-2xl font-extrabold text-accent">{scenario.card}</span>
        <h3 className="font-display text-lg font-bold">{t(key('title'))}</h3>
      </div>
      <p className="text-sm text-muted">{t(key('look'))}</p>
      <div className="flex flex-col gap-4">
        {scenario.steps.map((step, index) => {
          const single = scenario.steps.length === 1;
          // What to do on the page the button opens: inputs and buttons only, never a result.
          const setup = t(key(single ? 'setup' : `setup${index + 1}`)).split('\n');
          return (
            <div key={index} className="flex flex-col items-start gap-2">
              <StepAction
                step={step}
                label={single ? t('demo.run') : t(key(`step${index + 1}`))}
                panel={panel}
                locale={locale}
                t={t}
              />
              <div className="text-sm">
                <p className="eyebrow">{t('demo.then')}</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 marker:text-muted">
                  {setup.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">{scenario.decisions.join(' · ')}</p>
    </li>
  );
}

function StepAction({
  step,
  label,
  panel,
  locale,
  t,
}: {
  step: ScenarioStep;
  label: string;
  panel: DemoPanelData;
  locale: Locale;
  t: Translate;
}) {
  const record = resolveScenarioTarget(panel, step.target);
  const href =
    scenarioHref(step, locale) ??
    (record
      ? `/${locale}/${record.kind === 'contract' ? 'contracts' : 'quotes'}/${record.id}`
      : null);
  if (!href) {
    return (
      <p className="max-w-xs rounded-lg border border-dashed border-line px-3 py-1.5 text-sm text-muted">
        {label}: {t(missingKey(step))}
      </p>
    );
  }
  return (
    <DemoRunButton
      locale={locale}
      asOf={step.asOf}
      href={href}
      label={`${label} · ${formatIsoDate(step.asOf, locale)}`}
    />
  );
}

/** What to run first when a step's contract or quote doesn't exist yet. */
function missingKey(step: ScenarioStep): MessageKey {
  if (step.target.kind === 'open_quote') return 'demo.needs.quote';
  if (step.target.kind === 'contract' && step.target.status === 'awaiting_signatory') {
    return 'demo.needs.sent';
  }
  return 'demo.needs.card1';
}

function LinkList({
  items,
  empty,
}: {
  items: { key: string; href: string; label: string; note: string }[];
  empty: string;
}) {
  if (items.length === 0) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-2 divide-y divide-line text-sm">
      {items.map((item) => (
        <li key={item.key} className="flex items-baseline justify-between gap-3 py-2">
          <Link href={item.href} className="font-semibold underline">
            {item.label}
          </Link>
          <span className="text-muted">{item.note}</span>
        </li>
      ))}
    </ul>
  );
}
