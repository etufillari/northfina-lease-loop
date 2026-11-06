import { describe, expect, it } from 'vitest';
import {
  dealerNextActions,
  type DealerActionAsset,
  type DealerSignatureFact,
} from './dealer-next-actions';

const available: DealerActionAsset = {
  id: 'bike-1',
  make: 'Demo',
  model: 'Bike',
  status: 'available',
  hasActiveLease: false,
  lastClosedOn: null,
  release: null,
};
const release = {
  revision: 1,
  readyOn: '2026-11-06',
  netPriceCents: 100000,
  reservedForCustomerId: null,
};
const signature: DealerSignatureFact = {
  quoteId: 'offer-1',
  assetId: 'bike-1',
  customerId: 'private-person',
  submittedOn: '2026-11-06',
  pricedOn: '2026-11-05',
  validThrough: '2026-11-10',
  startDate: '2026-11-10',
  releaseRevision: 0,
  awaitingSigner: true,
  hasContract: false,
};

function run(assets: DealerActionAsset[], signatures: DealerSignatureFact[] = []) {
  return dealerNextActions({ assets, signatures, onDate: '2026-11-06' });
}

describe('dealer next actions from current records', () => {
  it('shows one specific action per item, with signing blockers first', () => {
    const actions = run(
      [
        { ...available, id: 'bike-3', release },
        { ...available, id: 'bike-2', status: 'returned' },
        available,
      ],
      [signature]
    );
    expect(actions.map(({ assetId, kind }) => ({ assetId, kind }))).toEqual([
      { assetId: 'bike-1', kind: 'awaiting_signer' },
      { assetId: 'bike-2', kind: 'prepare_item' },
      { assetId: 'bike-3', kind: 'offer_ready' },
    ]);
  });
  it('does not turn ordinary catalogue availability or an unknown reservation into a task', () => {
    expect(run([available, { ...available, id: 'reserved', status: 'reserved' }])).toEqual([]);
  });
  it('deduplicates handoffs for one offer and groups multiple offers under their item', () => {
    expect(
      run([available], [signature, signature, { ...signature, quoteId: 'offer-2' }])
    ).toMatchObject([{ kind: 'awaiting_signer', pendingSignatures: 2 }]);
  });
  it('suppresses an offer-ready entry when the item is blocked on signing', () => {
    expect(run([{ ...available, release }], [{ ...signature, releaseRevision: 1 }])).toMatchObject([
      { kind: 'awaiting_signer' },
    ]);
  });
  it.each([
    { submittedOn: '2026-11-07' },
    { pricedOn: '2026-11-07' },
    { validThrough: '2026-11-05' },
    { startDate: '2026-11-05' },
    { releaseRevision: 2 },
    { awaitingSigner: false },
    { hasContract: true },
  ])('excludes handoffs that cannot proceed: %j', (change) => {
    expect(run([available], [{ ...signature, ...change }])).toEqual([]);
  });
  it('includes a handoff on its last valid day and its start day', () => {
    expect(
      run([available], [{ ...signature, validThrough: '2026-11-06', startDate: '2026-11-06' }])
    ).toHaveLength(1);
  });
  it('excludes pending signatures incompatible with an existing reservation', () => {
    expect(
      run(
        [{ ...available, release: { ...release, reservedForCustomerId: 'someone-else' } }],
        [{ ...signature, releaseRevision: 1 }]
      )
    ).toMatchObject([{ kind: 'offer_ready', pendingSignatures: 0 }]);
    expect(
      run(
        [{ ...available, release: { ...release, reservedForCustomerId: signature.customerId } }],
        [{ ...signature, releaseRevision: 1 }]
      )
    ).toMatchObject([{ kind: 'awaiting_signer' }]);
  });
  it('removes actions when an active lease exists, even if stale item flags remain', () => {
    expect(
      run([{ ...available, release, hasActiveLease: true }], [{ ...signature, releaseRevision: 1 }])
    ).toEqual([]);
    expect(run([{ ...available, status: 'returned', hasActiveLease: true }])).toEqual([]);
  });
  it.each([
    { readyOn: '2026-11-07' },
    { readyOn: null },
    { netPriceCents: null },
    { netPriceCents: 0 },
  ])('only shows published offers that are ready and priced: %j', (change) => {
    expect(run([{ ...available, release: { ...release, ...change } }])).toEqual([]);
  });
  it('does not invent earlier stock state when a future return has already been recorded', () => {
    expect(run([{ ...available, status: 'returned', lastClosedOn: '2026-11-07' }])).toEqual([]);
    expect(run([{ ...available, status: 'returned', lastClosedOn: '2026-11-06' }])).toMatchObject([
      { kind: 'prepare_item' },
    ]);
  });
  it('uses item IDs for stable ordering within a priority and leaves inputs untouched', () => {
    const assets: DealerActionAsset[] = [
      { ...available, id: 'z', status: 'returned' },
      { ...available, id: 'a', status: 'returned' },
    ];
    const before = structuredClone(assets);
    expect(run(assets).map((action) => action.assetId)).toEqual(['a', 'z']);
    expect(assets).toEqual(before);
    expect(run(assets)).toEqual(run([...assets].reverse()));
  });
  it('keeps private identities and offer references out of the result', () => {
    const output = JSON.stringify(run([available], [signature]));
    expect(output).not.toContain(signature.customerId);
    expect(output).not.toContain(signature.quoteId);
  });
  it('rejects an invalid demo date', () => {
    expect(() => dealerNextActions({ assets: [], signatures: [], onDate: '2026-02-30' })).toThrow(
      RangeError
    );
  });
});
