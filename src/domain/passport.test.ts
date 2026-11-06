// Problem 3's bonus (the passport: an item's full history across lives) and card 10
// (`ebike-008` shows two past lives plus what the event log has).
import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import { livesFromEvents, passportFor, wholeMonths, type PassportEvent } from './passport';
import { ASSUMED_PAST_LIFE_MONTHS } from './second-life/co2';

let nextId = 1;
const event = (
  kind: PassportEvent['kind'],
  on_date: string,
  contract_id: string | null = null,
  details: unknown = {}
): PassportEvent => ({ id: nextId++, kind, on_date, contract_id, details });

const ebike008: Asset = {
  id: 'ebike-008',
  category: 'e_bike',
  make: 'Kettu Bikes',
  model: 'Urban 1',
  model_year: 2022,
  serial_number: 'LL-EB-240959',
  condition: 'good',
  usage: { unit: 'km', value: 9800 },
  previous_lives: 2,
  status: 'returned',
};

describe('wholeMonths (counted like the invoice schedule)', () => {
  it('the start day to the day before the same day next month is one month', () => {
    expect(wholeMonths('2026-01-15', '2026-02-14')).toBe(1);
    expect(wholeMonths('2026-01-15', '2026-02-13')).toBe(0);
    expect(wholeMonths('2026-01-15', '2026-02-15')).toBe(1);
  });

  it('a calendar month from the first is one month, a whole year twelve', () => {
    expect(wholeMonths('2026-01-01', '2026-01-31')).toBe(1);
    expect(wholeMonths('2026-11-06', '2028-11-05')).toBe(24);
  });

  it('a start on the 31st clamps to the end of a shorter month', () => {
    expect(wholeMonths('2026-01-31', '2026-02-27')).toBe(1);
    expect(wholeMonths('2026-01-31', '2026-02-26')).toBe(0);
    expect(wholeMonths('2028-01-31', '2028-02-28')).toBe(1); // leap year: Feb 29 − 1
  });

  it('the same day, or an end before the start, is zero months', () => {
    expect(wholeMonths('2026-03-10', '2026-03-10')).toBe(0);
    expect(wholeMonths('2026-03-10', '2026-03-01')).toBe(0);
  });
});

describe('livesFromEvents', () => {
  it('no events, no lives', () => {
    expect(livesFromEvents([])).toEqual({ before: [], lives: [] });
  });

  it('leased opens a life and returned closes it, with whole months and the contract', () => {
    const { lives } = livesFromEvents([
      event('leased', '2026-01-15', 'c-1'),
      event('returned', '2027-01-14', 'c-1'),
    ]);
    expect(lives).toHaveLength(1);
    expect(lives[0]).toMatchObject({
      start: '2026-01-15',
      end: '2027-01-14',
      contractId: 'c-1',
      months: 12,
      endKind: 'returned',
      estimated: false,
      between: [],
    });
  });

  it('bought and passed_on close a life too', () => {
    const { lives } = livesFromEvents([
      event('leased', '2026-01-01', 'c-1'),
      event('passed_on', '2026-06-30', 'c-1'),
      event('leased', '2026-07-10', 'c-2'),
      event('bought', '2027-07-09', 'c-2'),
    ]);
    expect(lives.map((life) => [life.endKind, life.months])).toEqual([
      ['passed_on', 6],
      ['bought', 12],
    ]);
  });

  it('assessed, refurbished and repriced attach to the gap after the life they follow', () => {
    const { lives } = livesFromEvents([
      event('leased', '2026-01-01', 'c-1'),
      event('returned', '2026-12-31', 'c-1'),
      event('assessed', '2027-01-02'),
      event('refurbished', '2027-01-05'),
      event('repriced', '2027-01-06'),
      event('leased', '2027-01-10', 'c-2'),
    ]);
    expect(lives).toHaveLength(2);
    expect(lives[0]!.between.map((e) => e.kind)).toEqual(['assessed', 'refurbished', 'repriced']);
    expect(lives[1]!.between).toEqual([]);
  });

  it('events before the first lease go to `before`', () => {
    const { before, lives } = livesFromEvents([
      event('assessed', '2026-01-01'),
      event('leased', '2026-01-02', 'c-1'),
    ]);
    expect(before.map((e) => e.kind)).toEqual(['assessed']);
    expect(lives).toHaveLength(1);
  });

  it('an open life has no end; its months run to the given day, or are unknown without one', () => {
    const events = [event('leased', '2026-11-06', 'c-3')];
    expect(livesFromEvents(events)[`lives`][0]).toMatchObject({ end: null, months: null });
    expect(livesFromEvents(events, '2027-05-05').lives[0]).toMatchObject({
      end: null,
      months: 6,
      endKind: null,
    });
  });

  it('two events on one day are read in log order, never re-sorted', () => {
    const { lives } = livesFromEvents([
      event('leased', '2026-03-01', 'c-1'),
      event('returned', '2026-03-01', 'c-1'),
      event('leased', '2026-03-01', 'c-2'),
    ]);
    expect(lives.map((life) => [life.contractId, life.end, life.months])).toEqual([
      ['c-1', '2026-03-01', 0],
      ['c-2', null, null],
    ]);
  });

  it('a lease while a life is still open closes the open one on that day', () => {
    const { lives } = livesFromEvents([
      event('leased', '2026-01-01', 'c-1'),
      event('leased', '2026-04-01', 'c-2'),
    ]);
    expect(lives[0]).toMatchObject({ end: '2026-04-01', endKind: null, months: 3 });
    expect(lives[1]).toMatchObject({ start: '2026-04-01', end: null });
  });

  it('a closing event with no open life is kept in the gap, not dropped', () => {
    const { before } = livesFromEvents([event('returned', '2026-01-01', 'c-0')]);
    expect(before.map((e) => e.kind)).toEqual(['returned']);
  });
});

describe('passportFor', () => {
  it('card 10: ebike-008 shows its two past lives, undated and estimated, before the log', () => {
    const passport = passportFor(
      ebike008,
      [event('leased', '2026-11-06', 'c-third')],
      '2028-11-05'
    );
    expect(passport.assetId).toBe('ebike-008');
    expect(passport.lives).toHaveLength(3);
    expect(passport.lives.slice(0, 2)).toEqual([
      expect.objectContaining({ index: 0, start: null, end: null, estimated: true }),
      expect.objectContaining({ index: 1, start: null, end: null, estimated: true }),
    ]);
    expect(passport.lives[0]!.months).toBe(ASSUMED_PAST_LIFE_MONTHS);
    expect(passport.lives[2]).toMatchObject({
      index: 2,
      start: '2026-11-06',
      contractId: 'c-third',
      months: 24,
      estimated: false,
    });
  });

  it('a new item with no history has no lives', () => {
    const passport = passportFor({ ...ebike008, id: 'ebike-009', previous_lives: 0 }, []);
    expect(passport.lives).toEqual([]);
    expect(passport.before).toEqual([]);
  });

  it('past lives with no log yet are still shown', () => {
    expect(passportFor(ebike008, []).lives).toHaveLength(2);
  });
});
