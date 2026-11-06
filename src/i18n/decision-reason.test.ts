import { expect, it } from 'vitest';
import { explainDecision } from './decision-reason';
import { getT } from './get-t';
it('explains authoritative decision reasons in all supported languages', () => {
  for (const locale of ['en', 'fi', 'sv', 'et'] as const) {
    const t = getT(locale);
    expect(explainDecision('Applicant signing authority must be confirmed', t)).toBe(
      t('decision.signer')
    );
    expect(explainDecision('Politically exposed person requires manual review', t)).toBe(
      t('decision.pep')
    );
    expect(explainDecision('Monthly rent including VAT exceeds the affordability limit', t)).toBe(
      t('decision.affordability')
    );
    expect(explainDecision('internal details not safe for UI', t)).toBe(t('decision.review'));
  }
});
