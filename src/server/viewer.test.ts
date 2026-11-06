import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { canSee, resolveViewer, STAFF, viewerCustomerId, type Viewer } from './viewer';

let customers: Customer[];
beforeAll(async () => {
  customers = await loadCustomers();
});

describe('resolveViewer', () => {
  it('is a guest without a cookie or with an unknown id', () => {
    expect(resolveViewer(undefined, customers)).toEqual({ kind: 'guest' });
    expect(resolveViewer('cust-nobody', customers)).toEqual({ kind: 'guest' });
  });

  it('finds a customer from the data pack', () => {
    const viewer = resolveViewer('cust-aino', customers);
    expect(viewer.kind === 'customer' && viewer.customer.name).toBe('Aino Virtanen');
  });

  it('recognises staff', () => {
    expect(resolveViewer(STAFF, customers)).toEqual({ kind: 'staff' });
  });
});

describe('canSee and viewerCustomerId', () => {
  const guest: Viewer = { kind: 'guest' };
  const staff: Viewer = { kind: 'staff' };
  const aino = (): Viewer => resolveViewer('cust-aino', customers);

  it('lets a customer see only their own contracts', () => {
    expect(canSee(aino(), 'cust-aino')).toBe(true);
    expect(canSee(aino(), 'cust-mikko')).toBe(false);
    expect(canSee(aino(), null)).toBe(false);
  });

  it('lets a guest see only contracts made as a guest', () => {
    expect(canSee(guest, null)).toBe(true);
    expect(canSee(guest, 'cust-aino')).toBe(false);
  });

  it('lets staff see everything', () => {
    expect(canSee(staff, 'cust-aino')).toBe(true);
    expect(canSee(staff, null)).toBe(true);
  });

  it('records the customer id only for customers', () => {
    expect(viewerCustomerId(aino())).toBe('cust-aino');
    expect(viewerCustomerId(guest)).toBeNull();
    expect(viewerCustomerId(staff)).toBeNull();
  });
});
