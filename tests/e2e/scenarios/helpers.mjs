// Shared steps for the scenarios.

/** Aino's answers for a consumer lease (scenario card 1). */
export const AINO_ANSWERS = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: '3200',
  q_usage_purpose: 'commuting',
};

/**
 * Applies for and signs a lease through the API, from the page (so the viewer and date
 * cookies apply), and returns the contract.
 */
export async function leaseFor(page, assetId, signerName, termMonths = 24) {
  const application = await page.post('/api/applications', {
    assetId,
    termMonths,
    downPaymentCents: 0,
    answers: AINO_ANSWERS,
  });
  if (!application.success)
    throw new Error(`apply ${assetId}: ${JSON.stringify(application.error)}`);
  const signed = await page.post('/api/contracts', {
    applicationId: application.data.id,
    signerName,
  });
  if (!signed.success) throw new Error(`sign ${assetId}: ${JSON.stringify(signed.error)}`);
  return signed.data;
}
