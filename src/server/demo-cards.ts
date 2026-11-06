// The scenario card runner behind the demo page's buttons (docs/features/demo-cards.md): each
// of the ten cards of CHALLENGE.md section 4 as data (its customer, item, term, down payment,
// days and exit), run through the same services the routes call, each with the card's day as
// `today` and the card's customer as the actor, so every write goes through withAudit and the
// audit page shows the run. The outputs are whatever those services return: nothing below knows
// a card's numbers (AGENTS.md rule 7). A card that already ran is refused and linked (D70).
import { loadCustomers } from '@/data/load';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import type { MatchResult } from '@/domain/second-life/match';
import { ADMIN_ACTOR } from './actor';
import { createApplication, listApplications, type ApplicationView } from './applications';
import { contractIdOfApplication, getContract, signContract } from './contracts';
import {
  demoCardSchema,
  type DemoCard,
  type DemoCardId,
  type DemoCardInput,
  type DemoCardRun,
  type DemoTrip as Trip,
  type DemoStep,
} from './demo-cards-schemas';
import { previewExit } from './exits';
import { listInvoices, payInvoice } from './invoices';
import type { PrismaClient } from './prisma-client';
import { createQuote, getQuote, loadPricingData } from './quotes';
import { assessAsset, latestAssessment } from './second-life';

const AINO_EBIKE_36 = {
  customerId: 'cust-aino',
  assetId: 'ebike-003',
  termMonths: 36,
  quoteOn: '2026-11-05',
};

/** The ten cards' inputs (CHALLENGE.md section 4); `clock` is the day the judges look. */
const CARD_INPUTS: readonly DemoCardInput[] = [
  { id: 1, run: 'sign', clock: '2026-11-05', trip: AINO_EBIKE_36, signOn: '2026-11-05' },
  {
    id: 2,
    run: 'sign',
    clock: '2026-11-06',
    trip: { customerId: 'cust-aino', assetId: 'laptop-004', termMonths: 36, quoteOn: '2026-11-05' },
    signOn: '2026-11-06',
  },
  {
    id: 3,
    run: 'sign',
    clock: '2027-01-01',
    trip: { customerId: 'cust-aino', assetId: 'ebike-001', termMonths: 24, quoteOn: '2026-09-15' },
    signOn: '2026-09-15',
  },
  {
    id: 4,
    run: 'sign',
    clock: '2026-02-01',
    trip: { customerId: 'cust-aino', assetId: 'laptop-001', termMonths: 36, quoteOn: '2026-01-31' },
    signOn: '2026-01-31',
  },
  {
    id: 5,
    run: 'apply',
    clock: '2026-11-05',
    trip: {
      customerId: 'cust-mikko',
      assetId: 'laptop-008',
      termMonths: 36,
      quoteOn: '2026-11-05',
    },
  },
  {
    id: 6,
    run: 'apply',
    clock: '2026-11-05',
    trip: {
      customerId: 'cust-norvi',
      assetId: 'ebike-004',
      termMonths: 36,
      quoteOn: '2026-11-05',
    },
  },
  {
    id: 7,
    run: 'apply',
    clock: '2026-11-05',
    trip: {
      customerId: 'cust-haapala',
      assetId: 'farm-002',
      termMonths: 48,
      downPaymentCents: 2_000_000,
      quoteOn: '2026-11-05',
    },
  },
  {
    id: 8,
    run: 'exit_preview',
    clock: '2027-06-05',
    trip: AINO_EBIKE_36,
    signOn: '2026-11-05',
    rentsPaid: 7,
    exit: { mode: 'buy', condition: 'good', usage: { unit: 'km', value: 1_800 } },
  },
  {
    id: 9,
    run: 'asset',
    clock: '2026-11-06',
    actor: ADMIN_ACTOR,
    assetId: 'ebike-007',
    page: 'second_life',
  },
  {
    id: 10,
    run: 'asset',
    clock: '2026-11-06',
    actor: ADMIN_ACTOR,
    assetId: 'ebike-008',
    page: 'passport',
    lease: {
      trip: {
        customerId: 'cust-olavi',
        assetId: 'ebike-008',
        termMonths: 24,
        quoteOn: '2026-11-06',
      },
      signOn: '2026-11-06',
    },
  },
];

export const DEMO_CARDS: readonly DemoCard[] = CARD_INPUTS.map((card) =>
  demoCardSchema.parse(card)
);

export function demoCard(id: DemoCardId): DemoCard {
  const card = DEMO_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`no demo card ${id}`);
  return card;
}

/** Who the judge acts as after the run: the card's customer, or the actor it names. */
export function demoCardActor(card: DemoCard): string {
  return card.run === 'asset' ? card.actor : card.trip.customerId;
}

export type DemoCardRefusal =
  | { code: 'card_already_run'; params: { cardId: number } }
  | { code: 'card_step_refused'; params: { cardId: number; step: string; reason: string } };

export type RunDemoCardResult =
  | { ok: true; run: DemoCardRun }
  | {
      ok: false;
      reason: DemoCardRefusal;
      today: string;
      actor: string;
      /** The records the earlier run left, for `card_already_run`; null otherwise. */
      landing: string | null;
    };

type Earlier = { application: ApplicationView; contractId: string | null };

/** Thrown inside a run when a service refuses; turned into `card_step_refused`. */
class StepRefused extends Error {
  constructor(
    readonly step: string,
    readonly reason: string
  ) {
    super(`${step}: ${reason}`);
  }
}

/**
 * The application an earlier run of `trip` left (or one made by hand on the same deal): same
 * customer, item, term, down payment and quote day. A signed one wins over an
 * unsigned one, so a stray second application never hides the contract.
 */
async function earlierRun(db: PrismaClient, trip: Trip): Promise<Earlier | null> {
  let unsigned: Earlier | null = null;
  for (const application of await listApplications(db, { customerId: trip.customerId })) {
    const quote = await getQuote(db, application.quoteId);
    const deal = quote?.breakdown;
    const same =
      quote?.quoteDate === trip.quoteOn &&
      deal?.assetId === trip.assetId &&
      deal.termMonths === trip.termMonths &&
      deal.downPaymentCents === trip.downPaymentCents;
    if (!same) continue;
    const contractId = await contractIdOfApplication(db, application.id);
    if (contractId) return { application, contractId };
    unsigned ??= { application, contractId: null };
  }
  return unsigned;
}

/**
 * The contract a signing card works on: the earlier run's, an approved earlier application
 * signed now (a run stopped before signing picks up where it stopped), or a new quote,
 * application and signature. Null when an earlier application cannot be signed (not approved).
 */
async function contractFor(
  db: PrismaClient,
  card: { trip: Trip; signOn: string },
  earlier: Earlier | null,
  steps: DemoStep[]
): Promise<string | null> {
  if (earlier?.contractId) return earlier.contractId;
  if (earlier) {
    if (earlier.application.decision !== 'approved') return null;
    steps.push({
      code: 'application_reused',
      params: { decision: earlier.application.decision, date: earlier.application.decidedOn },
      href: `/applications/${earlier.application.id}`,
    });
    return sign(db, earlier.application, card.signOn, steps);
  }
  const application = await quoteAndApply(db, card.trip, steps);
  return sign(db, application, card.signOn, steps);
}

function landingOf(earlier: Earlier): string {
  return earlier.contractId
    ? `/contracts/${earlier.contractId}`
    : `/applications/${earlier.application.id}`;
}

/** Quote and application on the trip's quote day, as its customer; the steps they took. */
async function quoteAndApply(db: PrismaClient, trip: Trip, steps: DemoStep[]) {
  const quoted = await createQuote(
    db,
    {
      assetId: trip.assetId,
      termMonths: trip.termMonths,
      downPaymentCents: trip.downPaymentCents,
      today: trip.quoteOn,
      actor: trip.customerId,
    },
    await loadPricingData()
  );
  if (!quoted.ok) throw new StepRefused('quote', quoted.reason.code);
  const { breakdown } = quoted.quote;
  steps.push({
    code: 'quote_created',
    params: {
      assetId: trip.assetId,
      termMonths: trip.termMonths,
      downPaymentCents: trip.downPaymentCents,
      monthlyNetCents: breakdown.monthlyNetCents,
      priceListVersion: breakdown.priceListVersion,
      date: trip.quoteOn,
    },
    href: `/apply/${quoted.quote.id}`,
  });

  const customer = (await loadCustomers()).find((c) => c.id === trip.customerId);
  if (!customer) throw new StepRefused('application', 'customer_not_found');
  const applied = await createApplication(db, {
    quoteId: quoted.quote.id,
    customerId: trip.customerId,
    answers: { ...answersFromCustomer(customer), ...trip.answers },
    today: trip.quoteOn,
    actor: trip.customerId,
  });
  if (!applied.ok) throw new StepRefused('application', applied.reason);
  const { application } = applied;
  steps.push({
    code: 'application_decided',
    params: { decision: application.decision, date: application.decidedOn },
    href: `/applications/${application.id}`,
  });
  for (const reason of application.reasons) {
    steps.push({ code: 'application_reason', params: { ...reason.params, reason: reason.code } });
  }
  return application;
}

/** Signs on `signOn` as the customer; the contract's id. */
async function sign(
  db: PrismaClient,
  application: ApplicationView,
  signOn: string,
  steps: DemoStep[]
): Promise<string> {
  const signed = await signContract(
    db,
    { applicationId: application.id, actor: application.customerId },
    signOn,
    await loadPricingData()
  );
  if (!signed.ok) throw new StepRefused('signing', signed.reason.code);
  const { contract, priceLock } = signed.details;
  steps.push({
    code: 'contract_signed',
    params: {
      number: contract.number,
      monthlyNetCents: contract.monthlyNetCents,
      startDate: contract.startDate,
      endDate: contract.endDate,
      date: signOn,
    },
    href: `/contracts/${contract.id}`,
  });
  if (priceLock) steps.push({ code: priceLock.code, params: priceLock.params });
  return contract.id;
}

/** Pays the first rents, each on its due day, until `count` are paid; how many it paid now. */
async function payRentsUpTo(db: PrismaClient, contractId: string, count: number, actor: string) {
  const rents = (await listInvoices(db, contractId)).filter((i) => i.kind === 'rent');
  const toPay = rents.slice(0, count).filter((i) => i.status !== 'paid');
  for (const rent of toPay) {
    const paid = await payInvoice(db, { id: rent.id, paidOn: rent.dueDate, actor });
    if (!paid.ok) throw new StepRefused('payment', paid.reason);
  }
  return { paidNow: toPay.length, grossCents: toPay.reduce((sum, i) => sum + i.grossCents, 0) };
}

/** The assessment's decision as one step: the winner and its rent, or the catalogue. */
function decisionStep(match: MatchResult): DemoStep {
  const { winner, relist } = match;
  if (!winner) return { code: 'relisted_without_match', params: { condition: relist.condition } };
  return {
    code: 'relisted_for_winner',
    params: {
      demandId: winner.demandId,
      condition: winner.condition,
      termMonths: winner.termMonths,
      monthlyNetCents: winner.monthlyNetCents,
    },
  };
}

/**
 * Cards 9 and 10: what runs on a returned item before the judge lands on its page. The item is
 * assessed and relisted as admin on the card's day (`assessAsset`, the route's own service);
 * a card with a lease then quotes, applies and signs it as that customer. An item no longer
 * `returned` that has an assessment was run before: the lease picks up where it stopped, and a
 * card without one, or whose lease is signed, is refused and linked (D70).
 */
export async function afterReturn(
  db: PrismaClient,
  card: Extract<DemoCard, { run: 'asset' }>,
  steps: DemoStep[]
): Promise<{ alreadyRun: boolean }> {
  const href = `/assets/${card.assetId}/second-life`;
  const assessed = await assessAsset(db, {
    assetId: card.assetId,
    actor: card.actor,
    today: card.clock,
  });
  if (assessed.ok) {
    const { relist } = assessed.view.match;
    steps.push({
      code: 'asset_assessed',
      params: {
        assetId: card.assetId,
        condition: assessed.view.assessment.returnedCondition,
        refurbishmentCents: relist.plan.totalCents,
        secondLifeFinancedCents: relist.secondLifeFinancedCents,
        date: card.clock,
      },
      href,
    });
    steps.push({ ...decisionStep(assessed.view.match), href });
  } else if (
    assessed.reason.code !== 'asset_not_returned' ||
    !(await latestAssessment(db, card.assetId))
  ) {
    throw new StepRefused('assessment', assessed.reason.code);
  }

  if (!card.lease) return { alreadyRun: !assessed.ok };
  const earlier = await earlierRun(db, card.lease.trip);
  if (earlier?.contractId) return { alreadyRun: true };
  // The winner is a waiting-list entry, not a customer who can sign: the card's customer leases
  // the item from the catalogue at the same second-life price.
  const winner = (assessed.ok ? assessed.view : await latestAssessment(db, card.assetId))?.match
    .winner;
  steps.push({
    code: 'leased_from_catalogue',
    params: { demandId: winner?.demandId ?? '—', customer: card.lease.trip.customerId },
  });
  const contractId = await contractFor(db, card.lease, earlier, steps);
  return { alreadyRun: contractId === null };
}

type Ran = { steps: DemoStep[]; landing: string } | { alreadyRun: string };

async function runSteps(db: PrismaClient, card: DemoCard): Promise<Ran> {
  const steps: DemoStep[] = [];
  if (card.run === 'asset') {
    const { alreadyRun } = await afterReturn(db, card, steps);
    const page = card.page === 'passport' ? 'passport' : 'second-life';
    const landing = `/assets/${card.assetId}/${page}`;
    return alreadyRun ? { alreadyRun: landing } : { steps, landing };
  }

  const earlier = await earlierRun(db, card.trip);
  if (card.run === 'apply') {
    if (earlier) return { alreadyRun: landingOf(earlier) };
    const application = await quoteAndApply(db, card.trip, steps);
    return { steps, landing: `/applications/${application.id}` };
  }
  if (card.run === 'sign' && earlier?.contractId) return { alreadyRun: landingOf(earlier) };

  const contractId = await contractFor(db, card, earlier, steps);
  if (!contractId) return { alreadyRun: landingOf(earlier!) };
  const landing = `/contracts/${contractId}`;
  if (card.run === 'sign') return { steps, landing };

  // Card 8 builds on card 1's contract. Paying is idempotent and the preview writes nothing,
  // so a repeat run only shows the preview again; an ended contract has no preview.
  if (earlier?.contractId) steps.push({ code: 'contract_reused', params: {}, href: landing });
  const contract = await getContract(db, contractId);
  if (contract?.status !== 'active') return { alreadyRun: landing };
  const actor = card.trip.customerId;
  const { paidNow, grossCents } = await payRentsUpTo(db, contractId, card.rentsPaid, actor);
  if (paidNow > 0) steps.push({ code: 'rents_paid', params: { count: paidNow, grossCents } });

  const reported = { condition: card.exit.condition, usage: card.exit.usage };
  const preview = await previewExit(db, { contractId, mode: card.exit.mode, reported }, card.clock);
  if (!preview.ok) throw new StepRefused('exit_preview', preview.reason.code);
  steps.push({
    code: 'exit_previewed',
    params: {
      monthsPaid: preview.preview.monthsPaid,
      buyTotalCents: preview.preview.buy.totalCents,
      returnTotalCents: preview.preview.return.totalCents,
      date: card.clock,
    },
    href: landing,
  });
  return { steps, landing };
}

/**
 * Runs card `cardId` and says what it did. The caller sets the demo clock to `today` and the
 * actor cookie to `actor` in both outcomes, so the landing link opens as the judges expect.
 */
export async function runDemoCard(
  db: PrismaClient,
  cardId: DemoCardId
): Promise<RunDemoCardResult> {
  const card = demoCard(cardId);
  const today = card.clock;
  const actor = demoCardActor(card);
  try {
    const ran = await runSteps(db, card);
    if ('alreadyRun' in ran) {
      const reason = { code: 'card_already_run', params: { cardId } } as const;
      return { ok: false, reason, today, actor, landing: ran.alreadyRun };
    }
    return { ok: true, run: { cardId, today, actor, ...ran } };
  } catch (error) {
    if (!(error instanceof StepRefused)) throw error;
    const params = { cardId, step: error.step, reason: error.reason };
    return {
      ok: false,
      reason: { code: 'card_step_refused', params },
      today,
      actor,
      landing: null,
    };
  }
}
