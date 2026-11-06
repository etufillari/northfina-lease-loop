import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import { matchSecondLife, type MatchingInput } from './second-life-matching';

let fixture: MatchingInput;
beforeAll(async () => {
  const [assets, table, costs, rules, requests] = await Promise.all([
    loadAssets(),
    loadCoefficientTable(),
    loadRefurbishmentCosts(),
    loadResidualCurves(),
    loadSecondLifeDemand(),
  ]);
  fixture = {
    asset: assets.find((asset) => asset.id === 'ebike-007')!,
    table,
    costs,
    rules,
    requests,
    ageMonths: 24,
    originalPriceCents: 250000,
    onDate: '2026-11-06',
    readyOn: '2026-11-06',
  };
});

function run(change: Partial<MatchingInput> = {}) {
  return matchSecondLife({ ...fixture, ...change });
}

describe('second-life matchmaking', () => {
  it('recommends mandatory-only work for wait-02 before wait-13 when both are feasible', () => {
    // Explicit synthetic age and first-lease price, not facts inferred from model year.
    const result = run({
      requests: fixture.requests.filter((request) => ['wait-02', 'wait-13'].includes(request.id)),
    });
    expect(result.recommendation).toMatchObject({
      requestId: 'wait-02',
      condition: 'fair',
      workNetCents: 39500,
      netPriceCents: 67600,
      reasons: [],
    });
    expect(
      result.candidates.find((row) => row.requestId === 'wait-13' && row.condition === 'fair')
        ?.reasons
    ).toContain('condition');
    expect(
      result.candidates.find((row) => row.requestId === 'wait-13' && row.condition === 'good')
        ?.reasons
    ).toEqual([]);
  });

  it('honours an exact budget and rejects one cent below it', () => {
    const request = fixture.requests.find((row) => row.id === 'wait-02')!;
    const candidate = run({ requests: [request] }).recommendation!;
    expect(
      run({ requests: [{ ...request, max_monthly_net_rent_cents: candidate.monthlyNetCents! }] })
        .recommendation
    ).not.toBeNull();
    expect(
      run({
        requests: [{ ...request, max_monthly_net_rent_cents: candidate.monthlyNetCents! - 1 }],
      }).recommendation
    ).toBeNull();
  });

  it('accepts the readiness deadline itself and rejects the day after', () => {
    const request = fixture.requests.find((row) => row.id === 'wait-02')!;
    expect(run({ requests: [request], readyOn: request.needed_by }).recommendation).not.toBeNull();
    expect(
      run({ requests: [request], readyOn: '2026-11-11' }).candidates.every((row) =>
        row.reasons.includes('deadline')
      )
    ).toBe(true);
  });

  it('prioritises the earlier deadline before cheaper repairs', () => {
    const request = fixture.requests.find((row) => row.id === 'wait-02')!;
    const requests = [
      request,
      { ...request, id: 'earlier', needed_by: '2026-11-09', min_condition: 'good' as const },
    ];
    expect(run({ requests }).recommendation).toMatchObject({
      requestId: 'earlier',
      condition: 'good',
    });
  });

  it('uses stable IDs for equal needs regardless of input ordering', () => {
    const base = fixture.requests.find((row) => row.id === 'wait-02')!;
    const requests = [
      { ...base, id: 'b' },
      { ...base, id: 'a' },
    ];
    expect(run({ requests }).recommendation?.requestId).toBe('a');
    expect(run({ requests: [...requests].reverse() }).recommendation).toEqual(
      run({ requests }).recommendation
    );
  });

  it('prefers better condition when eligible repairs have exactly the same cost', () => {
    const costs = structuredClone(fixture.costs);
    costs.e_bike.condition_upgrades['fair->good'] = 0;
    costs.e_bike.condition_upgrades['good->like_new'] = 0;
    const request = fixture.requests.find((row) => row.id === 'wait-02')!;
    expect(run({ costs, requests: [request] }).recommendation).toMatchObject({
      requestId: request.id,
      condition: 'like_new',
      workNetCents: 39500,
      reasons: [],
    });
  });

  it.each(['ageMonths', 'originalPriceCents'] as const)(
    'cannot recommend with unknown %s',
    (field) => {
      expect(run({ [field]: null }).recommendation).toBeNull();
    }
  );

  it('rejects the wrong category, unavailable inventory, unsupported terms and uneconomic work', () => {
    const request = fixture.requests.find((row) => row.id === 'wait-02')!;
    expect(run({ requests: [{ ...request, category: 'laptop' }] }).recommendation).toBeNull();
    expect(run({ asset: { ...fixture.asset, status: 'reserved' } }).recommendation).toBeNull();
    expect(
      run({ requests: [{ ...request, preferred_term_months: 18 }] }).recommendation
    ).toBeNull();
    expect(run({ originalPriceCents: 1000 }).recommendation).toBeNull();
    expect(run({ requests: [] })).toEqual({ candidates: [], recommendation: null });
  });

  it('does not erase missing farm service history or a mandatory data wipe', () => {
    const asset = {
      ...fixture.asset,
      category: 'farm_machine' as const,
      usage: { unit: 'engine_hours' as const, value: 1500 },
    };
    expect(run({ asset, originalPriceCents: 14000000 }).recommendation).toBeNull();
    const laptop = {
      ...fixture.asset,
      category: 'laptop' as const,
      condition: 'good' as const,
      usage: { unit: 'battery_cycles' as const, value: 10 },
    };
    expect(
      run({ asset: laptop, originalPriceCents: 100000 }).recommendation?.tasks.some(
        (task) => task.id === 'certified_data_wipe'
      )
    ).toBe(true);
  });

  it('has no price before the coefficient table is valid', () => {
    expect(
      run({ table: { ...fixture.table, valid_from: '2027-01-01' } }).recommendation
    ).toBeNull();
  });

  it('recommends anonymous requests without allowing them to overwrite a reservation', () => {
    const request = fixture.requests.find((row) => row.id === 'wait-02')!;
    expect(
      run({ requests: [request], unidentifiedRequestIds: [request.id] }).recommendation
    ).toMatchObject({ requestId: request.id, reasons: ['identity_unknown'] });
    expect(
      run({ requests: [request], incompatibleReservationIds: [request.id] }).recommendation
    ).toBeNull();
    expect(
      run({
        requests: [{ ...request, max_monthly_net_rent_cents: 1 }],
        unidentifiedRequestIds: [request.id],
      }).recommendation
    ).toBeNull();
  });

  it('never reallocates a waiting request recorded as fulfilled', () => {
    const request = fixture.requests.find((row) => row.id === 'wait-02')!;
    const result = run({ requests: [request], allocatedRequestIds: ['wait-02'] });
    expect(result.recommendation).toBeNull();
    expect(result.candidates.every((row) => row.reasons.includes('allocated'))).toBe(true);
  });

  it('does not mutate inputs or depend on current clock time', () => {
    const before = structuredClone(fixture);
    expect(run()).toEqual(run());
    expect(fixture).toEqual(before);
  });

  it('rejects malformed dates, duplicate identifiers and fractional budgets', () => {
    expect(() => run({ readyOn: '2026-02-30' })).toThrow(RangeError);
    expect(() => run({ onDate: 'bad' })).toThrow(RangeError);
    expect(() => run({ readyOn: '2026-11-05' })).toThrow(RangeError);
    const request = fixture.requests[0]!;
    expect(() => run({ requests: [request, request] })).toThrow(RangeError);
    expect(() => run({ requests: [{ ...request, needed_by: 'bad' }] })).toThrow(RangeError);
    expect(() => run({ requests: [{ ...request, max_monthly_net_rent_cents: 1.5 }] })).toThrow(
      RangeError
    );
  });
});
