// The ten scenario cards on the demo page, each with its inputs in one line (read from the card
// table in src/server/demo-cards.ts, so the page and the runner cannot disagree) and its Run
// button. A server component; the button is the small client in card-run-form.tsx.
import type { MessageKey, Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { ADMIN_ACTOR } from '@/server/actor';
import type { DemoCard, DemoTrip } from '@/server/demo-cards-schemas';
import { formatParams } from './card-steps';
import { CardRunForm } from './card-run-form';

type CardListProps = {
  cards: readonly DemoCard[];
  /** Customer id → name, for the inputs line. */
  names: ReadonlyMap<string, string>;
  locale: Locale;
  t: Translate;
};

/** The card's inputs as one line: who, what, how long, which days. */
export function cardInputs(
  card: DemoCard,
  names: ReadonlyMap<string, string>,
  t: Translate,
  locale: Locale
): string {
  const parts: string[] = [];
  const lease = (trip: DemoTrip, signOn?: string) => {
    const { customerId, assetId, termMonths, downPaymentCents, quoteOn } = trip;
    const shown = { assetId, termMonths, downPaymentCents, quoteOn };
    const customer = names.get(customerId) ?? customerId;
    parts.push(t('demo.input.trip', formatParams({ ...shown, customer }, t, locale)));
    if (signOn) parts.push(t('demo.input.signed', formatParams({ signOn }, t, locale)));
  };
  if (card.run === 'asset') {
    const actor = card.actor === ADMIN_ACTOR ? t('actor.admin') : card.actor;
    parts.push(t('demo.input.asset', { assetId: card.assetId, actor }));
    if (card.lease) lease(card.lease.trip, card.lease.signOn);
  } else {
    lease(card.trip, card.run === 'apply' ? undefined : card.signOn);
    if (card.run === 'exit_preview') {
      const exit = {
        rentsPaid: card.rentsPaid,
        mode: t(`exit.mode.${card.exit.mode}` as MessageKey),
        condition: card.exit.condition,
        usage: `${card.exit.usage.value} ${card.exit.usage.unit}`,
      };
      parts.push(t('demo.input.exit', formatParams(exit, t, locale)));
    }
  }
  parts.push(t('demo.input.clock', formatParams({ date: card.clock }, t, locale)));
  return parts.join(' · ');
}

export function CardList({ cards, names, locale, t }: CardListProps) {
  return (
    <ol className="divide-y divide-line">
      {cards.map((card) => (
        <li key={card.id} className="space-y-2 py-4">
          <p>
            <span className="mr-2 font-semibold tabular-nums text-ink-muted">{card.id}.</span>
            <span className="font-semibold">{t(`demo.card.${card.id}` as MessageKey)}</span>
          </p>
          <p className="text-sm break-words text-ink-muted">{cardInputs(card, names, t, locale)}</p>
          <CardRunForm cardId={card.id} locale={locale} />
        </li>
      ))}
    </ol>
  );
}
