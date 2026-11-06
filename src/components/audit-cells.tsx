// The readable cells of one audit-trail row: who, what, which record and the key facts.
import Link from 'next/link';
import type { AuditActor, AuditFact } from '@/domain/audit-facts';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { messages, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(messages.en, key);
}

export function ActorCell({ actor, t }: { actor: AuditActor; t: Translate }) {
  if (actor.type === 'customer') return <span className="font-medium">{actor.name}</span>;
  if (actor.type === 'role') return <span>{t(`audit.actor.${actor.role}`)}</span>;
  return <span className="break-all text-muted">{actor.text}</span>;
}

export function ActionChip({ action, t }: { action: string; t: Translate }) {
  const key = `audit.action.${action}`;
  return (
    <span className="inline-block rounded-full bg-accent/10 px-2.5 py-1 ring-1 ring-accent/25 ring-inset text-xs font-semibold whitespace-nowrap text-accent-text">
      {isMessageKey(key) ? t(key) : action}
    </span>
  );
}

export function RecordCell(props: {
  entityType: string;
  entityId: string;
  assetName: string | undefined;
  locale: Locale;
  t: Translate;
}) {
  const { entityType, entityId, assetName, locale, t } = props;
  const link = 'font-medium underline decoration-fg/30 underline-offset-4 hover:decoration-accent';
  if (entityType === 'contract' || entityType === 'quote') {
    return (
      <Link href={`/${locale}/${entityType}s/${entityId}`} className={link}>
        {t(`audit.record.${entityType}`, { id: entityId })}
      </Link>
    );
  }
  if (entityType === 'asset') {
    return (
      <Link href={`/${locale}/assets/${entityId}`} className={link}>
        {assetName ?? entityId}
      </Link>
    );
  }
  return (
    <span className="font-mono text-xs">
      {entityType} {entityId}
    </span>
  );
}

function factText(fact: AuditFact, locale: Locale, t: Translate): string {
  const { value } = fact;
  if (value.type === 'condition') {
    return t('audit.fact.condition', {
      from: t(`condition.${value.from}`),
      to: t(`condition.${value.to}`),
    });
  }
  if (value.type === 'months') return t('lease.months', { count: value.months });
  const shown =
    value.type === 'money'
      ? formatEuro(value.cents, intlLocale[locale])
      : formatIsoDate(value.iso, locale);
  // `term` and `condition` are handled above; every other key has its own message.
  return t(`audit.fact.${fact.key as Exclude<AuditFact['key'], 'term' | 'condition'>}`, {
    value: shown,
  });
}

export function DetailsCell(props: {
  facts: AuditFact[];
  details: unknown;
  locale: Locale;
  t: Translate;
}) {
  const { facts, details, locale, t } = props;
  if (details === null) return null;
  return (
    <div className="flex flex-col gap-2">
      {facts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <li
              key={fact.key}
              className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs whitespace-nowrap tabular-nums"
            >
              {factText(fact, locale, t)}
            </li>
          ))}
        </ul>
      )}
      <details className="group text-xs text-muted">
        <summary className="w-fit cursor-pointer rounded select-none hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {t('audit.allDetails')}
        </summary>
        <pre className="mt-2 max-w-xl overflow-x-auto rounded-md bg-bg p-3 font-mono text-[0.7rem] leading-relaxed">
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}
