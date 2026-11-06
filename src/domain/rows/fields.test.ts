import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  conditionAtLeastAsGood,
  factorMillionthsSchema,
  jsonText,
  outcomeSchema,
  quantitySchema,
  VAT_RATE_BP_MAX,
  vatRateBpSchema,
} from './fields';

describe('vatRateBpSchema: a VAT rate in basis points, 0 to 100 %', () => {
  it.each([0, 2550, 2600, VAT_RATE_BP_MAX])('accepts %d', (bp) => {
    expect(vatRateBpSchema.safeParse(bp).success).toBe(true);
  });

  it.each([-1, VAT_RATE_BP_MAX + 1, 25.5, 255000])('refuses %d', (bp) => {
    expect(vatRateBpSchema.safeParse(bp).success).toBe(false);
  });
});

describe('quantity and factor', () => {
  it('a quantity is a whole number of units, at least 1', () => {
    expect(quantitySchema.safeParse(4).success).toBe(true);
    expect(quantitySchema.safeParse(0).success).toBe(false);
    expect(quantitySchema.safeParse(1.5).success).toBe(false);
  });

  it('a factor is whole millionths above zero (0.027584 is 27584)', () => {
    expect(factorMillionthsSchema.safeParse(27584).success).toBe(true);
    expect(factorMillionthsSchema.safeParse(0).success).toBe(false);
    expect(factorMillionthsSchema.safeParse(0.027584).success).toBe(false);
  });
});

describe('outcomeSchema: an outcome is a code with params, never a sentence', () => {
  it('accepts a snake_case code with string and number params', () => {
    const outcome = { code: 'too_young', params: { age: 17, minimum: 18 } };
    expect(outcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it('refuses a sentence as the code', () => {
    expect(outcomeSchema.safeParse({ code: 'You are too young', params: {} }).success).toBe(false);
  });
});

describe('jsonText: the *_json text columns', () => {
  const listOfNumbers = z.array(z.number().int());

  it('accepts JSON text of the expected shape', () => {
    expect(jsonText(listOfNumbers).safeParse('[1,2]').success).toBe(true);
  });

  it('refuses text that is not JSON, and JSON of another shape', () => {
    expect(jsonText(listOfNumbers).safeParse('[1,').success).toBe(false);
    expect(jsonText(listOfNumbers).safeParse('["a"]').success).toBe(false);
  });
});

describe('conditionAtLeastAsGood: the conditions are ordered best first', () => {
  it('new is at least as good as fair, and fair is as good as fair', () => {
    expect(conditionAtLeastAsGood('new', 'fair')).toBe(true);
    expect(conditionAtLeastAsGood('fair', 'fair')).toBe(true);
  });

  it('poor is not as good as good', () => {
    expect(conditionAtLeastAsGood('poor', 'good')).toBe(false);
  });
});
