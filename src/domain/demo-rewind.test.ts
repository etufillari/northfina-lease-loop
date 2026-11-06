import { describe, expect, it } from 'vitest';
import { rewindStep, type RewindContract } from './demo-rewind';

// Card 1: Aino's lease, signed 5 Nov 2026.
const aino: RewindContract = {
  id: 'aino',
  isDemo: true,
  status: 'active',
  startDate: '2026-11-05',
  endedOn: null,
  signatoryEmail: null,
  signedOn: null,
};

describe('rewindStep', () => {
  it('removes a lease that started after the new date, and keeps one that started on it', () => {
    expect(rewindStep(aino, '2026-11-04')).toBe('remove');
    expect(rewindStep(aino, '2026-11-05')).toBe('trim');
  });
  it('undoes a buyout made after the date, but not one made before', () => {
    const bought = { ...aino, status: 'bought', endedOn: '2027-05-20' };
    expect(rewindStep(bought, '2027-05-19')).toBe('unbuy');
    expect(rewindStep(bought, '2027-05-20')).toBe('trim');
  });
  it('card 6: puts a contract back to waiting when its signatory signed after the date', () => {
    const signed = {
      ...aino,
      startDate: '2026-11-20',
      signatoryEmail: 'ceo@norvi.example.com',
      signedOn: '2026-11-20',
    };
    expect(rewindStep(signed, '2026-11-10')).toBe('unsign');
    expect(rewindStep(signed, '2026-11-20')).toBe('trim');
  });
  it('never touches a real lease', () => {
    expect(rewindStep({ ...aino, isDemo: false }, '2020-01-01')).toBeNull();
  });
  it('only trims a return completed after the date', () => {
    const returned = { ...aino, status: 'returned', endedOn: '2027-06-01' };
    expect(rewindStep(returned, '2027-05-01')).toBe('trim');
  });
});
