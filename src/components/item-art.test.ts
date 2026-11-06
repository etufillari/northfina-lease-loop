import { describe, expect, it } from 'vitest';
import { artKindFor } from './item-art';

describe('artKindFor', () => {
  it('picks a drawing from the model name', () => {
    expect(artKindFor('e_bike', 'Cargo Duo')).toBe('cargo');
    expect(artKindFor('e_bike', 'Delivery Pro')).toBe('cargo');
    expect(artKindFor('e_bike', 'Fold Mini')).toBe('fold');
    expect(artKindFor('e_bike', 'Kids 20')).toBe('kids');
    expect(artKindFor('e_bike', 'Urban 2 Step-through')).toBe('step');
    expect(artKindFor('e_bike', 'Gravel X')).toBe('trail');
    expect(artKindFor('laptop', 'Gamer 17')).toBe('laptopGamer');
    expect(artKindFor('laptop', 'Edu 11')).toBe('laptopSmall');
    expect(artKindFor('farm_machine', 'Combine CX')).toBe('combine');
    expect(artKindFor('farm_machine', 'Robot Milker')).toBe('milker');
    expect(artKindFor('farm_machine', 'T-140 Tractor')).toBe('tractor');
  });

  it('falls back to the plain drawing of the category', () => {
    expect(artKindFor('e_bike', 'Urban 1')).toBe('city');
    expect(artKindFor('laptop', 'Pro 16')).toBe('laptop');
    expect(artKindFor('farm_machine', 'Seed Drill 4m')).toBe('implement');
  });

  it('takes the first matching rule when a name matches two', () => {
    // "Cargo" and "Fold" both match; cargo is listed first.
    expect(artKindFor('e_bike', 'Cargo Fold')).toBe('cargo');
  });
});
