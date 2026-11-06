// The ten scenario cards from CHALLENGE.md, each run end to end on a fresh database through
// the same server functions the API routes call — what a judge clicks through, as code.
// The numbers are worked out by hand in the comments; each card is independent.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadPriceLists, loadSecondLifeDemand } from '@/data/load';
import { listPriceOn } from '@/domain/price-list';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { answerQuestion, startApplication, submitApplication } from './applications';
import { seedAssets } from './assets';
import { getContract, signApplication } from './contracts';
import { seedCustomers } from './customers';
import { earlyExitPreview, executeEarlyExit } from './lifecycle';
import { assetPassport } from './passport';
import { executeSecondLife, listReturnedDecisions } from './second-life';
import { approveApplication } from './staff';
import { acceptOffer } from './waitlist-actions';
import { seedWaitlist } from './waitlist';

type Db = Awaited<ReturnType<typeof createTestDb>>['db'];
let db: Db;
let cleanup: () => Promise<void>;
beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
  await seedWaitlist(db, await loadSecondLifeDemand());
});
afterEach(async () => {
  await cleanup();
});

/** Aino applies for one item and signs, all on `on` (start date = `on`). */
async function ainoSigns(assetId: string, termMonths: number, on: string) {
  const state = await applyAndSubmit(db, {
    customerId: 'cust-aino',
    assetIds: [assetId],
    downPaymentCents: 0,
    termMonths,
    script: ainoScript,
    asOf: on,
  });
  expect(state.application.status).toBe('approved');
  const signed = await signApplication(db, {
    applicationId: state.application.id,
    startDate: on,
    actor: 'cust-aino',
    asOf: on,
  });
  if (!signed.ok) throw new Error(`sign: ${signed.reason}`);
  const contract = await getContract(db, signed.contractId);
  return contract!;
}

describe('card 1 — happy path: Aino, ebike-003, 36 months, no down payment, 5 Nov 2026', () => {
  it('shows the rent net and with VAT, the first three invoices and the total', async () => {
    const contract = await ainoSigns('ebike-003', 36, '2026-11-05');
    // 389 000 × 0.027584 (band B, 36 mo) = 10 730.18 → 10 730.
    expect(contract).toMatchObject({
      price_list_version: 1,
      financed_cents: 389_000,
      monthly_net_rent_cents: 10_730,
      // 389 000 × 0.027584 × 36 = 386 286.34 → 386 286; the last month takes the leftover.
      net_total_cents: 386_286,
      last_month_net_rent_cents: 10_736,
      // 15 % of 389 000.
      buyout_net_cents: 58_350,
    });
    const [first, second, third] = contract.invoices;
    // Billed in advance from the start day; VAT at the rate on each due date.
    expect(first).toMatchObject({
      due_date: '2026-11-05',
      net_cents: 10_730,
      vat_rate_bp: 2550,
      vat_cents: 2736, // 10 730 × 25.5 % = 2 736.15
      total_cents: 13_466,
    });
    expect(second).toMatchObject({
      due_date: '2026-12-05',
      vat_rate_bp: 2550,
      total_cents: 13_466,
    });
    // 1 Jan 2027: VAT 26 %, rent unchanged. 10 730 × 26 % = 2 789.8 → 2 790.
    expect(third).toMatchObject({
      due_date: '2027-01-05',
      net_cents: 10_730,
      vat_rate_bp: 2600,
      vat_cents: 2790,
      total_cents: 13_520,
    });
    expect(contract.invoices).toHaveLength(36);
    const net = contract.invoices.reduce((sum, i) => sum + i.net_cents, 0);
    expect(net).toBe(386_286); // the months add up to the contract total, to the cent
  });
});

describe('card 2 — the price lock: laptop-004 quoted Thu 5 Nov (v1), signed Fri 6 Nov (v2)', () => {
  it('locks the v1 price; a day later the quote has expired', async () => {
    const priceLists = await loadPriceLists();
    const v1 = listPriceOn(priceLists, 'laptop-004', '2026-11-05');
    const v2 = listPriceOn(priceLists, 'laptop-004', '2026-11-06');
    if (!v1.ok || !v2.ok) throw new Error('no price');
    expect(v2.priceCents).toBeLessThan(v1.priceCents); // laptops 8 % cheaper in v2

    const state = await applyAndSubmit(db, {
      customerId: 'cust-aino',
      assetIds: ['laptop-004'],
      downPaymentCents: 0,
      termMonths: 24,
      script: ainoScript,
      asOf: '2026-11-05',
    });
    const signed = await signApplication(db, {
      applicationId: state.application.id,
      startDate: '2026-11-06',
      actor: 'cust-aino',
      asOf: '2026-11-06',
    });
    if (!signed.ok) throw new Error(signed.reason);
    const contract = await getContract(db, signed.contractId);
    expect(contract).toMatchObject({
      quote_date: '2026-11-05',
      price_list_version: 1,
      financed_cents: v1.priceCents,
    });
  });

  it('refuses to sign on Saturday 7 Nov: the Thursday quote is only valid through Friday', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-aino',
      assetIds: ['laptop-004'],
      downPaymentCents: 0,
      termMonths: 24,
      script: ainoScript,
      asOf: '2026-11-05',
    });
    const signed = await signApplication(db, {
      applicationId: state.application.id,
      startDate: '2026-11-07',
      actor: 'cust-aino',
      asOf: '2026-11-07',
    });
    expect(signed).toEqual({ ok: false, reason: 'quote_expired' });
  });
});

describe('card 3 — tax is not price: ebike-001, 24 months, started 15 Sep 2026', () => {
  it('December 2026 at 25.5 % and January 2027 at 26 %, the same net rent', async () => {
    const contract = await ainoSigns('ebike-001', 24, '2026-09-15');
    const december = contract.invoices.find((i) => i.due_date === '2026-12-15')!;
    const january = contract.invoices.find((i) => i.due_date === '2027-01-15')!;
    expect(december.net_cents).toBe(january.net_cents);
    expect(december.vat_rate_bp).toBe(2550);
    expect(january.vat_rate_bp).toBe(2600);
    expect(january.total_cents).toBeGreaterThan(december.total_cents);
    // The difference is VAT only: the net rent × 0.5 percentage points, rounded once each.
    expect(january.vat_cents - december.vat_cents).toBeLessThanOrEqual(
      Math.ceil(december.net_cents * 0.005) + 1
    );
  });
});

describe('card 4 — calendar traps: laptop-001, 36 months, starting 31 Jan 2026', () => {
  it('February 2026 is due on the 28th and February 2028 on the 29th; March goes back to 31st', async () => {
    const contract = await ainoSigns('laptop-001', 36, '2026-01-31');
    const due = contract.invoices.map((i) => i.due_date);
    expect(due).toContain('2026-02-28');
    expect(due).toContain('2026-03-31'); // clamping never sticks
    expect(due).toContain('2028-02-29');
    expect(due).not.toContain('2026-03-28');
    expect(due[0]).toBe('2026-01-31');
    expect(due).toHaveLength(36);
  });
});

describe('card 5 — too young: Mikko (17) applies for laptop-008', () => {
  it('stops at his birth date, kindly, with the day he can come back', async () => {
    const started = await startApplication(db, {
      assetIds: ['laptop-008'],
      downPaymentCents: 0,
      termMonths: 24,
      customerId: 'cust-mikko',
      actor: 'cust-mikko',
      asOf: '2026-11-05',
    });
    if (!started.ok) throw new Error(started.reason);
    const id = started.state.application.id;
    const script: Array<[string, unknown]> = [
      ['q_customer_type', 'consumer'],
      ['q_full_name', 'Mikko Laine'],
      ['q_birth_date', '2009-03-10'],
    ];
    let state = started.state;
    for (const [questionId, answer] of script) {
      const result = await answerQuestion(db, {
        applicationId: id,
        questionId,
        answer: answer as never,
        actor: 'cust-mikko',
        asOf: '2026-11-05',
      });
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
    }
    // He turns 18 on 10 March 2027.
    expect(state.blocked).toEqual({
      questionId: 'q_birth_date',
      rule: 'age_under',
      eligibleFrom: '2027-03-10',
    });
    // The application cannot be pushed through anyway.
    const submitted = await submitApplication(db, {
      applicationId: id,
      startDate: '2026-11-05',
      actor: 'cust-mikko',
      asOf: '2026-11-05',
    });
    expect(submitted.ok).toBe(false);
  });
});

describe('card 6 — who can sign? Norvi Logistics leases 4 e-bikes; the applicant cannot sign', () => {
  // Assets are unique physical items, so "4 × ebike-004" is four distinct e-bikes in one
  // fleet contract (docs/DECISIONS.md "Fleets"), banded on their total.
  const FLEET = ['ebike-004', 'ebike-005', 'ebike-006', 'ebike-012'];
  const norviScript = {
    q_customer_type: 'company',
    q_email: 'fleet@norvi.example.com',
    q_vat_registered: 'yes',
    q_business_id: '3299871-7',
    q_company_name: 'Norvi Logistics Oy',
    q_annual_revenue: 410_000_000,
    q_can_sign: 'no',
    q_signatory_email: 'ceo@norvi.example.com',
    q_beneficial_owners: ['Ilkka Norvi (100 %)'],
    q_pep: 'no',
    q_usage_purpose: 'delivery',
  };

  it('waits for the signatory; only the signatory can sign; then all four are leased', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-norvi',
      assetIds: FLEET,
      downPaymentCents: 0,
      termMonths: 36,
      script: norviScript,
      asOf: '2026-11-05',
    });
    expect(state.application).toMatchObject({
      status: 'awaiting_signature',
      signatoryEmail: 'ceo@norvi.example.com',
    });
    const sign = (actor: string) =>
      signApplication(db, {
        applicationId: state.application.id,
        startDate: '2026-11-05',
        actor,
        asOf: '2026-11-05',
      });
    expect(await sign('cust-norvi')).toEqual({ ok: false, reason: 'not_signatory' });
    const signed = await sign('ceo@norvi.example.com');
    if (!signed.ok) throw new Error(signed.reason);
    const assets = await db.asset.findMany({ where: { id: { in: FLEET } } });
    expect(assets.every((a) => a.status === 'leased')).toBe(true);
    const contract = await getContract(db, signed.contractId);
    expect(contract?.assets.map((a) => a.asset_id).sort()).toEqual([...FLEET].sort());
  });
});

describe('card 7 — big ticket: Haapalan Tila, farm-002 (€145,000), 48 months, €20,000 down', () => {
  it('asks the company and ownership questions, and ends in manual review for the PEP', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-haapala',
      assetIds: ['farm-002'],
      downPaymentCents: 2_000_000,
      termMonths: 48,
      script: {
        q_customer_type: 'company',
        q_email: 'office@haapala.example.com',
        q_vat_registered: 'yes',
        q_business_id: '2876543-5',
        q_company_name: 'Haapalan Tila Oy',
        q_can_sign: 'yes',
        q_farm_registry: 'FI-123456',
        q_annual_revenue: 95_000_000,
        q_beneficial_owners: ['Jussi Haapala (60 %)', 'Maria Haapala (40 %)'],
        q_pep: 'yes',
        q_pep_details: 'Jussi Haapala, municipal council member',
      },
      asOf: '2026-11-05',
    });
    expect(state.application.status).toBe('manual_review');
    // €125,000 financed: band C/D thresholds bring the big-ticket questions in.
    const asked = state.visibleQuestions.map((q) => q.id);
    for (const id of [
      'q_business_id',
      'q_farm_registry',
      'q_annual_revenue',
      'q_beneficial_owners',
      'q_pep',
      'q_pep_details',
    ]) {
      expect(asked).toContain(id);
    }
    const reasons = state.application.decisionReasons as Array<{ rule: string; outcome: string }>;
    expect(reasons.find((r) => r.rule === 'pep_manual_review')?.outcome).toBe('manual_review');
    // A person approves it from the staff desk.
    const approved = await approveApplication(db, {
      applicationId: state.application.id,
      actor: 'staff',
      asOf: '2026-11-05',
    });
    expect(approved).toMatchObject({ ok: true, status: 'approved' });
  });
});

describe('card 8 — early exit: Aino ends the card-1 lease in month 7', () => {
  it('shows the calculation first, then ends the lease with that invoice', async () => {
    const contract = await ainoSigns('ebike-003', 36, '2026-11-05');
    // Month 7 runs 5 May – 4 Jun 2027.
    const preview = await earlyExitPreview(db, contract.id, '2027-05-06');
    if (!preview.ok) throw new Error(preview.reason);
    const b = preview.preview.breakdown;
    expect(b).toMatchObject({ usedMonths: 7, coveringTermMonths: 12 });
    // Re-priced at the 12-month tier, minus what was paid, plus one month's handling fee.
    expect(b.exitNetCents).toBe(b.fairTotalNetCents - b.paidNetCents + b.handlingFeeNetCents);
    expect(b.exitTotalCents).toBe(147_096);

    const exit = await executeEarlyExit(db, {
      contractId: contract.id,
      actor: 'cust-aino',
      asOf: '2027-05-06',
      usageReadings: { 'ebike-003': 2350 },
    });
    expect(exit.ok).toBe(true);
    const ended = await getContract(db, contract.id);
    expect(ended?.status).toBe('ended_early_exit');
    expect(ended?.invoices.find((i) => i.type === 'early_exit')?.total_cents).toBe(147_096);
  });
});

describe('card 9 — second life: ebike-007, fair, 18,400 km', () => {
  it('needs a battery and an inspection, goes to wait-02 (not wait-13), at its market rent', async () => {
    const desk = await listReturnedDecisions(db, '2026-11-05');
    const card = desk.find((d) => d.assetId === 'ebike-007')!;
    if (!card.result.ok) throw new Error(card.result.reason);
    const { decision, outcome, winnerQuote } = card.result.preview;
    expect(decision.requiredItems.map((i) => i.id).sort()).toEqual([
      'battery_replacement',
      'safety_inspection',
    ]);
    expect(decision.upgrade).toBeNull();
    expect(decision.usageAfterRefurb).toBe(0);
    // 549 000 (v1) × 32.5 % (46 months) × 0.65 (fair), new battery → no km deduction.
    expect(decision.financedCents).toBe(115_976);
    expect(outcome).toMatchObject({ kind: 'offer', waiterId: 'wait-02' });
    expect(decision.considered.find((v) => v.id === 'wait-13')?.outcome).toBe(
      'condition_below_minimum'
    );
    // wait-02's preferred 12 months: 115 976 × 0.056022 = 6 497.2 → 6 497.
    expect(winnerQuote?.monthlyNetRentCents).toBe(6497);
  });
});

describe('card 10 — third life: ebike-008 already had 2 lives', () => {
  it('is leased again, and its passport shows the history and the CO₂ it saved', async () => {
    const executed = await executeSecondLife(db, {
      assetId: 'ebike-008',
      actor: 'staff',
      asOf: '2026-11-05',
    });
    if (!executed.ok) throw new Error(executed.reason);
    expect(executed.preview.outcome).toMatchObject({ kind: 'offer', waiterId: 'wait-01' });
    const accepted = await acceptOffer(db, {
      entryId: 'wait-01',
      actor: 'cust-sanna',
      asOf: '2026-11-05',
    });
    if (!accepted.ok) throw new Error(accepted.reason);
    // Answer whatever the form asks next, from Sanna's script.
    const sanna: Record<string, unknown> = {
      q_customer_type: 'consumer',
      q_full_name: 'Sanna Mäkelä',
      q_birth_date: '2004-11-02',
      q_email: 'sanna.makela@example.com',
      q_country: 'FI',
      q_employment: 'student',
      q_monthly_income: 90_000,
      q_usage_purpose: 'commuting',
    };
    let next: string | null = (
      await answerQuestion(db, {
        applicationId: accepted.applicationId,
        questionId: 'q_customer_type',
        answer: 'consumer' as never,
        actor: 'cust-sanna',
        asOf: '2026-11-05',
      }).then((r) => {
        if (!r.ok) throw new Error(r.reason);
        return r.state;
      })
    ).nextQuestionId;
    while (next !== null) {
      if (!(next in sanna)) throw new Error(`no scripted answer for ${next}`);
      const result = await answerQuestion(db, {
        applicationId: accepted.applicationId,
        questionId: next,
        answer: sanna[next] as never,
        actor: 'cust-sanna',
        asOf: '2026-11-05',
      });
      if (!result.ok) throw new Error(`${next}: ${result.reason}`);
      next = result.state.nextQuestionId;
    }
    const submitted = await submitApplication(db, {
      applicationId: accepted.applicationId,
      startDate: '2026-11-05',
      actor: 'cust-sanna',
      asOf: '2026-11-05',
    });
    if (!submitted.ok) throw new Error(submitted.reason);
    expect(submitted.state.application.status).toBe('approved');
    const signed = await signApplication(db, {
      applicationId: accepted.applicationId,
      startDate: '2026-11-05',
      actor: 'cust-sanna',
      asOf: '2026-11-05',
    });
    if (!signed.ok) throw new Error(signed.reason);

    const passport = await assetPassport(db, 'ebike-008', '2026-11-05');
    expect(passport?.currentLife).toBe(3);
    expect(passport?.events.map((e) => e.type)).toEqual([
      'refurbished',
      'offered_to_waiter',
      'offer_accepted',
      'leased',
    ]);
    expect(passport?.recordedLives).toEqual([
      expect.objectContaining({ life: 3, onDate: '2026-11-05' }),
    ]);
    expect(passport?.recordedLives[0]!.co2AvoidedKg).toBeGreaterThan(0);
    expect(passport?.co2?.kg).toBeGreaterThan(0);
  });
});
