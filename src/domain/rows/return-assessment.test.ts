import { describe, expect, it } from 'vitest';
import { returnAssessmentRow } from '../../../tests/helpers/row-examples';
import { returnAssessmentRowSchema } from './return-assessment';

const refuses = (row: unknown) => returnAssessmentRowSchema.safeParse(row).success === false;

describe('returnAssessmentRowSchema: what a returned item was found to be', () => {
  it('accepts an item left as returned, in fair condition (card 9 shape)', () => {
    expect(returnAssessmentRowSchema.parse(returnAssessmentRow())).toEqual(returnAssessmentRow());
  });

  it('an item not refurbished keeps its condition', () => {
    expect(refuses({ ...returnAssessmentRow(), new_condition: 'good' })).toBe(true);
  });

  it('a refurbished item ends as good or better than it came back, never worse', () => {
    const refurbished = { ...returnAssessmentRow(), refurbish: true, new_condition: 'good' };
    expect(returnAssessmentRowSchema.safeParse(refurbished).success).toBe(true);
    expect(refuses({ ...refurbished, new_condition: 'poor' })).toBe(true);
  });

  it('refuses refurbishment steps that are not a list of steps with integer cents', () => {
    const euros = JSON.stringify([{ step: 'safety_check', cost_cents: 49.0001 }]);
    expect(refuses({ ...returnAssessmentRow(), refurbishment_json: euros })).toBe(true);
  });

  it('takes no match: nobody on the list may fit', () => {
    const unmatched = { ...returnAssessmentRow(), matched_demand_id: null };
    expect(returnAssessmentRowSchema.safeParse(unmatched).success).toBe(true);
  });

  it('refuses a condition outside the data pack’s five', () => {
    expect(refuses({ ...returnAssessmentRow(), condition: 'broken' })).toBe(true);
  });
});
